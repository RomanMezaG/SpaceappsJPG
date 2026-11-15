import asyncio
import csv
import json
import math
import struct
import traceback
import zlib
from collections import Counter
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path

from bleak import BleakClient, BleakScanner
from bleak.exc import BleakError

# Reutiliza las funciones del main.py que ya te funciona.
# Importarlo no inicia su programa porque usa:
# if __name__ == "__main__":
from main import (
    DIRECCION,
    autenticar,
    escribir,
    obtener_caracteristica,
    solicitar_clave,
)


DIAS_HISTORIAL = 7
MAX_LOTES_POR_TIPO = 20
MAX_BYTES_POR_LOTE = 4_000_000

UUID_FETCH = "00000004-0000-3512-2118-0009af100700"
UUID_DATOS = "00000005-0000-3512-2118-0009af100700"
UUID_RESUMEN = "00000007-0000-3512-2118-0009af100700"
UUID_HORA = "00002a2b-0000-1000-8000-00805f9b34fb"

TIPOS = [
    ("actividad", 0x01),
    ("pulso_manual", 0x02),
    ("estres_automatico", 0x13),
    ("estres_manual", 0x12),
    ("pai", 0x0D),
]


def fecha_iso(fecha):
    return fecha.astimezone(timezone.utc).isoformat()


def base_fila(fecha):
    return {
        "direccion": DIRECCION,
        "epoch_s": int(fecha.timestamp()),
        "fecha_utc": fecha_iso(fecha),
    }


def guardar_json(ruta, contenido):
    ruta.write_text(
        json.dumps(contenido, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def guardar_csv(carpeta, nombre, filas):
    if not filas:
        return

    columnas = list(dict.fromkeys(
        columna
        for fila in filas
        for columna in fila
    ))

    with (carpeta / f"{nombre}.csv").open(
        "w", newline="", encoding="utf-8-sig"
    ) as archivo:
        escritor = csv.DictWriter(archivo, fieldnames=columnas)
        escritor.writeheader()
        escritor.writerows(filas)


def categoria_estres(valor):
    if not 0 <= valor <= 100:
        return "sin_dato"
    if valor < 40:
        return "relajado"
    if valor < 60:
        return "leve"
    if valor < 80:
        return "moderado"
    return "alto"


def validar_tamano(datos, tamano, nombre):
    if len(datos) % tamano:
        raise ValueError(
            f"{nombre}: se recibieron {len(datos)} bytes; "
            f"se esperaban registros de {tamano} bytes."
        )


def decodificar(nombre, inicio, datos):
    filas = []

    if nombre == "actividad":
        # Mi Band 5: registros extendidos de 8 bytes por minuto.
        validar_tamano(datos, 8, nombre)

        for posicion in range(0, len(datos), 8):
            registro = datos[posicion:posicion + 8]
            fecha = inicio + timedelta(minutes=posicion // 8)
            tipo, intensidad, pasos, pulso = registro[:4]

            filas.append({
                **base_fila(fecha),
                "tipo_actividad_raw": tipo,
                "intensidad_raw": intensidad,
                "pasos_minuto": pasos,
                "pulso_bpm": pulso if pulso not in (0, 255) else None,
                "sueno_detectado": int(tipo == 120),
                "campo_desconocido": registro[4],
                "sueno_raw": registro[5],
                "profundo_raw": registro[6],
                "rem_raw": registro[7],
                "registro_hex": registro.hex(),
            })

    elif nombre == "estres_automatico":
        # Un byte por minuto. 255 indica ausencia de muestra.
        for minuto, valor in enumerate(datos):
            fecha = inicio + timedelta(minutes=minuto)

            filas.append({
                **base_fila(fecha),
                "estres": valor if 0 <= valor <= 100 else None,
                "categoria_fabricante": categoria_estres(valor),
                "valor_raw": valor,
            })

    elif nombre == "estres_manual":
        # Timestamp Unix de 4 bytes + valor de estrés.
        validar_tamano(datos, 5, nombre)

        for posicion in range(0, len(datos), 5):
            segundos, valor = struct.unpack_from("<IB", datos, posicion)
            fecha = datetime.fromtimestamp(segundos, timezone.utc)

            filas.append({
                **base_fila(fecha),
                "estres": valor if 0 <= valor <= 100 else None,
                "categoria_fabricante": categoria_estres(valor),
                "valor_raw": valor,
            })

    elif nombre == "pulso_manual":
        # Timestamp Unix + zona en cuartos de hora + pulso.
        validar_tamano(datos, 6, nombre)

        for posicion in range(0, len(datos), 6):
            segundos, zona, pulso = struct.unpack_from(
                "<IbB", datos, posicion
            )
            fecha = datetime.fromtimestamp(segundos, timezone.utc)

            filas.append({
                **base_fila(fecha),
                "offset_utc_minutos": zona * 15,
                "pulso_bpm": pulso if pulso not in (0, 255) else None,
                "pulso_raw": pulso,
            })

    elif nombre == "pai":
        # Formato PAI tipo 5: registros de 102 bytes.
        validar_tamano(datos, 102, nombre)

        for posicion in range(0, len(datos), 102):
            registro = datos[posicion:posicion + 102]

            if registro[0] != 5:
                raise ValueError(
                    f"Formato PAI desconocido: tipo {registro[0]}."
                )

            segundos = struct.unpack_from("<I", registro, 1)[0]
            zona = struct.unpack_from("<b", registro, 5)[0]
            valores = struct.unpack_from("<3f3h2f", registro, 37)

            if any(not math.isfinite(v) or v < 0 for v in valores):
                raise ValueError("PAI contiene valores no interpretables.")

            fecha = datetime.fromtimestamp(segundos, timezone.utc)

            filas.append({
                **base_fila(fecha),
                "offset_utc_minutos": zona * 15,
                "pai_baja_intensidad": valores[0],
                "pai_moderada_intensidad": valores[1],
                "pai_alta_intensidad": valores[2],
                "minutos_baja_intensidad": valores[3],
                "minutos_moderada_intensidad": valores[4],
                "minutos_alta_intensidad": valores[5],
                "pai_hoy": valores[6],
                "pai_total": valores[7],
                "registro_hex": registro.hex(),
            })

    else:
        raise ValueError(f"Tipo no implementado: {nombre}")

    return filas


def codificar_fecha(fecha, zona):
    local = fecha.astimezone(zona)
    cuartos = int(local.utcoffset().total_seconds() / 900)

    return struct.pack(
        "<HBBBBBb",
        local.year,
        local.month,
        local.day,
        local.hour,
        local.minute,
        0,
        cuartos,
    )


def fecha_cabecera(paquete):
    if len(paquete) not in (15, 16):
        raise ValueError(
            f"Cabecera histórica desconocida: {len(paquete)} bytes."
        )

    anio, mes, dia, hora, minuto, segundo, zona = struct.unpack_from(
        "<H5Bb", paquete, 7
    )

    if not -48 <= zona <= 56:
        raise ValueError("Zona horaria histórica fuera del formato esperado.")

    return datetime(
        anio, mes, dia, hora, minuto, segundo,
        tzinfo=timezone(timedelta(minutes=zona * 15)),
    )


async def detener_notificaciones(cliente, caracteristica):
    if cliente.is_connected:
        with suppress(BleakError, TimeoutError):
            await asyncio.wait_for(
                cliente.stop_notify(caracteristica),
                timeout=5,
            )


async def descargar_bloque(
    cliente, codigo, desde, zona, archivo_raw
):
    control = obtener_caracteristica(cliente, UUID_FETCH)
    datos_char = obtener_caracteristica(cliente, UUID_DATOS)

    cola = asyncio.Queue()
    eventos = []
    contenido = bytearray()
    inicio = None
    contador_esperado = 0
    datos_activos = False
    terminado = False

    def recibir_control(_caracteristica, paquete):
        cola.put_nowait(("control", bytes(paquete)))

    def recibir_datos(_caracteristica, paquete):
        cola.put_nowait(("datos", bytes(paquete)))

    await cliente.start_notify(control, recibir_control)

    try:
        peticion = bytes([0x01, codigo]) + codificar_fecha(desde, zona)
        await escribir(cliente, control, peticion)

        async with asyncio.timeout(180):
            while True:
                canal, paquete = await asyncio.wait_for(
                    cola.get(), timeout=25
                )
                eventos.append({
                    "canal": canal,
                    "hex": paquete.hex(),
                })

                if canal == "datos":
                    if inicio is None or len(paquete) < 2:
                        raise RuntimeError("Paquete histórico inesperado.")

                    if paquete[0] != contador_esperado:
                        raise RuntimeError(
                            "Se perdió el orden de los paquetes históricos: "
                            f"esperado {contador_esperado}, "
                            f"recibido {paquete[0]}."
                        )

                    contador_esperado = (contador_esperado + 1) & 0xFF
                    contenido.extend(paquete[1:])

                    if len(contenido) > MAX_BYTES_POR_LOTE:
                        raise RuntimeError("El lote supera el límite previsto.")

                    continue

                if len(paquete) < 3 or paquete[0] != 0x10:
                    raise RuntimeError(
                        "Respuesta histórica desconocida: " + paquete.hex()
                    )

                comando, estado = paquete[1], paquete[2]

                if estado != 0x01:
                    raise RuntimeError(
                        f"La pulsera rechazó el tipo 0x{codigo:02x}: "
                        + paquete.hex()
                    )

                if comando == 0x01:
                    if inicio is not None:
                        raise RuntimeError("Cabecera histórica repetida.")

                    inicio = fecha_cabecera(paquete)
                    cantidad = struct.unpack_from("<I", paquete, 3)[0]

                    if cantidad == 0:
                        terminado = True
                        return None, b""

                    print(
                        f"  Lote desde {fecha_iso(inicio)}; "
                        f"cantidad anunciada: {cantidad}"
                    )

                    await cliente.start_notify(datos_char, recibir_datos)
                    datos_activos = True
                    await escribir(cliente, control, b"\x02")

                elif comando == 0x02:
                    if inicio is None or not contenido:
                        raise RuntimeError(
                            "La transferencia terminó sin contenido interpretable."
                        )

                    if len(paquete) not in (3, 7):
                        raise RuntimeError("Final de transferencia desconocido.")

                    if len(paquete) == 7:
                        crc_recibido = struct.unpack_from("<I", paquete, 3)[0]
                        crc_calculado = zlib.crc32(contenido) & 0xFFFFFFFF

                        if crc_recibido != crc_calculado:
                            raise RuntimeError(
                                "La comprobación CRC del lote no coincide."
                            )

                    terminado = True
                    return inicio, bytes(contenido)

                else:
                    raise RuntimeError(
                        "Comando histórico inesperado: " + paquete.hex()
                    )

    finally:
        # Guarda también transferencias parciales para poder revisarlas.
        guardar_json(archivo_raw, {
            "tipo_hex": f"0x{codigo:02x}",
            "solicitado_desde_utc": fecha_iso(desde),
            "inicio_devuelto": fecha_iso(inicio) if inicio else None,
            "fin_transferencia_recibido": terminado,
            "eventos": eventos,
            "contenido_hex": contenido.hex(),
        })

        if datos_activos:
            await detener_notificaciones(cliente, datos_char)

        await detener_notificaciones(cliente, control)

        # Se omite el comando 0x03 de confirmación/borrado del historial.


async def leer_resumen_y_zona(cliente, carpeta):
    zona = datetime.now().astimezone().tzinfo
    informe = {}

    try:
        raw_hora = bytes(await cliente.read_gatt_char(
            UUID_HORA, use_cached=False
        ))

        if len(raw_hora) < 11:
            raise ValueError("Formato de hora sin zona reconocible.")

        cuartos = struct.unpack_from("<b", raw_hora, 10)[0]

        if not -48 <= cuartos <= 56:
            raise ValueError("Zona de la pulsera fuera de rango.")

        zona = timezone(timedelta(minutes=cuartos * 15))
        informe["origen_zona"] = "pulsera"
        informe["offset_utc_minutos"] = cuartos * 15

    except (BleakError, ValueError) as error:
        informe["origen_zona"] = "Windows"
        informe["aviso_zona"] = str(error)
        print("Aviso: se usará la zona horaria actual de Windows.")

    try:
        raw = bytes(await cliente.read_gatt_char(
            UUID_RESUMEN, use_cached=False
        ))
        guardar_json(carpeta / "resumen_actual_raw.json", {
            "fecha_recepcion_utc": fecha_iso(datetime.now(timezone.utc)),
            "hex": raw.hex(),
        })

        if len(raw) != 13:
            raise ValueError(
                f"Resumen de {len(raw)} bytes; se esperaba el formato de 13."
            )

        cabecera, pasos, metros, calorias = struct.unpack("<BIII", raw)

        guardar_csv(carpeta, "resumen_actual", [{
            **base_fila(datetime.now(timezone.utc)),
            "pasos_acumulados": pasos,
            "distancia_estimada_m": metros,
            "calorias_estimadas_kcal": calorias,
            "cabecera_raw": cabecera,
            "formato": "13_bytes_pendiente_contrastar_con_pantalla",
        }])

        print(
            f"Resumen actual: {pasos} pasos | "
            f"{metros} m | {calorias} kcal"
        )
        informe["resumen"] = "leido; comparar con la pantalla de la pulsera"

    except (BleakError, ValueError) as error:
        informe["resumen"] = f"no disponible: {error}"
        print(f"Resumen actual no disponible: {error}")

    return zona, informe


async def descargar_tipo(
    dispositivo, clave, nombre, codigo, desde, hasta, zona, carpeta
):
    acumulados = {}
    cursor = desde
    estado = "limite_de_lotes; descarga_parcial"
    error_texto = None

    try:
        async with BleakClient(dispositivo, timeout=30) as cliente:
            await autenticar(cliente, clave)

            for numero in range(1, MAX_LOTES_POR_TIPO + 1):
                raw = carpeta / f"raw_{nombre}_{numero:03d}.json"

                inicio, contenido = await descargar_bloque(
                    cliente, codigo, cursor, zona, raw
                )

                if inicio is None:
                    estado = "sin_mas_datos_segun_pulsera"
                    break

                filas = decodificar(nombre, inicio, contenido)

                if not filas:
                    raise RuntimeError(
                        "El lote no produjo registros interpretables."
                    )

                for fila in filas:
                    momento = datetime.fromtimestamp(
                        fila["epoch_s"], timezone.utc
                    )

                    if desde <= momento <= hasta:
                        acumulados[fila["epoch_s"]] = fila

                ultimo = datetime.fromtimestamp(
                    max(fila["epoch_s"] for fila in filas),
                    timezone.utc,
                )
                siguiente = ultimo.replace(
                    second=0, microsecond=0
                ) + timedelta(minutes=1)

                if siguiente <= cursor:
                    raise RuntimeError(
                        "La descarga no avanza en el tiempo. "
                        "Revisar los archivos raw antes de continuar."
                    )

                print(f"  Registros acumulados: {len(acumulados)}")

                if siguiente >= hasta:
                    estado = "alcanzado_fin_del_intervalo"
                    break

                cursor = siguiente

    except (
        BleakError, TimeoutError, RuntimeError, ValueError, struct.error
    ) as error:
        estado = "error_o_descarga_parcial"
        error_texto = f"{type(error).__name__}: {error}"
        print(f"  {error_texto}")

    finally:
        resultado = [
            acumulados[segundos]
            for segundos in sorted(acumulados)
        ]
        guardar_csv(carpeta, nombre, resultado)

    return resultado, {
        "estado": estado,
        "registros": len(resultado),
        "error": error_texto,
    }


def exportar_sueno(carpeta, actividad):
    if not actividad:
        return

    dormidos = [
        fila for fila in actividad
        if fila["sueno_detectado"] == 1
    ]
    guardar_csv(carpeta, "sueno_minutos", dormidos)

    registrados = Counter(
        fila["fecha_utc"][:10] for fila in actividad
    )
    minutos_sueno = Counter(
        fila["fecha_utc"][:10] for fila in dormidos
    )

    guardar_csv(carpeta, "sueno_resumen", [
        {
            "direccion": DIRECCION,
            "fecha_utc": dia,
            "minutos_con_registro": registrados[dia],
            "minutos_marcados_sueno": minutos_sueno[dia],
            "horas_marcadas_sueno": round(minutos_sueno[dia] / 60, 2),
            "metodo": "conteo_tipo_raw_120",
        }
        for dia in sorted(registrados)
    ])


async def ejecutar():
    if not 1 <= DIAS_HISTORIAL <= 365:
        raise ValueError("DIAS_HISTORIAL debe estar entre 1 y 365.")

    clave = solicitar_clave()

    hasta = datetime.now(timezone.utc)
    desde = (hasta - timedelta(days=DIAS_HISTORIAL)).replace(
        second=0, microsecond=0
    )

    carpeta = (
        Path(__file__).resolve().parent
        / "datos"
        / datetime.now().strftime("historial_%Y%m%d_%H%M%S_%f")
    )
    carpeta.mkdir(parents=True)

    informe = {
        "direccion": DIRECCION,
        "desde_utc": fecha_iso(desde),
        "hasta_utc": fecha_iso(hasta),
        "tipos": {},
    }

    print("\nBuscando la pulsera...")
    encontrados = await BleakScanner.discover(timeout=20)
    dispositivo = next(
        (
            item for item in encontrados
            if item.address.lower() == DIRECCION.lower()
        ),
        None,
    )

    if dispositivo is None:
        raise RuntimeError("No se encontró la Mi Band 5.")

    async with BleakClient(dispositivo, timeout=30) as cliente:
        await autenticar(cliente, clave)
        zona, informacion = await leer_resumen_y_zona(cliente, carpeta)
        informe.update(informacion)

    guardar_json(carpeta / "informe.json", informe)

    for nombre, codigo in TIPOS:
        print(f"\nDescargando: {nombre}")

        filas, estado = await descargar_tipo(
            dispositivo, clave, nombre, codigo,
            desde, hasta, zona, carpeta,
        )

        informe["tipos"][nombre] = estado
        guardar_json(carpeta / "informe.json", informe)

        if nombre == "actividad":
            exportar_sueno(carpeta, filas)

    print(f"\nArchivos guardados en:\n{carpeta}")
    print("Consulta informe.json para ver descargas vacías o parciales.")


if __name__ == "__main__":
    try:
        asyncio.run(ejecutar())
    except KeyboardInterrupt:
        print("\nDescarga interrumpida.")
    except Exception:
        traceback.print_exc()