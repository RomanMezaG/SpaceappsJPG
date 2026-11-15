import asyncio
import csv
import traceback

from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path

from bleak import BleakClient, BleakScanner
from bleak.exc import BleakError
from Crypto.Cipher import AES

from hrv import extraer_rr_ms


DIRECCION = "F0:D8:99:0D:4E:06"

UUID_AUTH = "00000009-0000-3512-2118-0009af100700"
UUID_PULSO = "00002a37-0000-1000-8000-00805f9b34fb"
UUID_CONTROL = "00002a39-0000-1000-8000-00805f9b34fb"

INTERVALO_MANTENIMIENTO = 12
TIEMPO_SIN_LECTURAS = 90


def solicitar_clave():
    clave_hex = "0xED686366BC19F3F815C95B67A917D9AD"
    return bytes.fromhex(clave_hex[2:])


def obtener_caracteristica(cliente, uuid):
    caracteristica = cliente.services.get_characteristic(uuid)

    if caracteristica is None:
        raise RuntimeError(
            f"The watch does not expose characteristic {uuid}."
        )

    return caracteristica


async def escribir(cliente, caracteristica, contenido):
    propiedades = caracteristica.properties

    if "write" in propiedades:
        respuesta = True
    elif "write-without-response" in propiedades:
        respuesta = False
    else:
        raise RuntimeError(
            f"Characteristic {caracteristica.uuid} "
            "does not support writes."
        )

    await cliente.write_gatt_char(
        caracteristica,
        contenido,
        response=respuesta,
    )


async def autenticar(cliente, clave):
    caracteristica = obtener_caracteristica(cliente, UUID_AUTH)
    respuestas = asyncio.Queue()

    def recibir_respuesta(_caracteristica, datos):
        respuestas.put_nowait(bytes(datos))

    print("Activando notificaciones de autenticación...")
    await cliente.start_notify(caracteristica, recibir_respuesta)

    try:
        print("Solicitando desafío de autenticación...")
        await escribir(cliente, caracteristica, b"\x02\x00")

        try:
            async with asyncio.timeout(30):
                while True:
                    paquete = await respuestas.get()
                    encabezado = paquete[:3]

                    if encabezado == b"\x10\x02\x01":
                        desafio = paquete[3:]

                        if len(desafio) != 16:
                            raise RuntimeError(
                                "The received authentication challenge is not 16 bytes long."
                            )

                        cifrador = AES.new(clave, AES.MODE_ECB)
                        respuesta = cifrador.encrypt(desafio)

                        print("Enviando respuesta al desafío...")
                        await escribir(
                            cliente,
                            caracteristica,
                            b"\x03\x00" + respuesta,
                        )

                    elif encabezado == b"\x10\x03\x01":
                        print(
                            "Autenticación aceptada por la pulsera."
                        )
                        return

                    elif encabezado == b"\x10\x03\x04":
                        raise RuntimeError(
                            "The watch rejected the AuthKey. "
                            "The key may be outdated "
                            "or belong to another pairing."
                        )

                    elif encabezado == b"\x10\x02\x04":
                        raise RuntimeError(
                            "The watch rejected the request "
                            "for an authentication challenge."
                        )

                    else:
                        raise RuntimeError(
                            "Unrecognized authentication response: "
                            + encabezado.hex()
                        )

        except TimeoutError:
            raise RuntimeError(
                "Authentication did not respond within 30 seconds. "
                "Check that the watch is still connected."
            ) from None

    finally:
        if cliente.is_connected:
            with suppress(BleakError, TimeoutError):
                await cliente.stop_notify(caracteristica)


def interpretar_pulso(paquete):
    if len(paquete) < 2:
        raise ValueError("Heart rate packet is too short.")

    indicadores = paquete[0]
    longitud = 2 if indicadores & 0x01 else 1

    if len(paquete) < 1 + longitud:
        raise ValueError("Incomplete heart rate packet.")

    pulso = int.from_bytes(
        paquete[1:1 + longitud],
        "little",
    )

    contacto = "No informado"

    if indicadores & 0x04:
        contacto = "Sí" if indicadores & 0x02 else "No"

    return pulso, contacto


async def leer_pulso(
    cliente,
    publicar=None,
    actualizar=None,
    publicar_rr=None,
):
    medida = obtener_caracteristica(cliente, UUID_PULSO)
    control = obtener_caracteristica(cliente, UUID_CONTROL)
    lecturas = asyncio.Queue()

    def recibir_pulso(_caracteristica, datos):
        fecha = datetime.now(timezone.utc).isoformat()
        lecturas.put_nowait((fecha, bytes(datos)))

    suscrito = False
    medicion_solicitada = False

    # Diagnóstico de los datos realmente recibidos.
    aviso_sin_rr = False
    rr_detectado = False
    paquetes_procesados = 0
    paquetes_con_rr = 0
    intervalos_recibidos = 0
    errores_rr = 0

    try:
        print("Preparando medición del pulso...")

        await escribir(cliente, control, b"\x15\x02\x00")
        await escribir(cliente, control, b"\x15\x01\x00")

        print("Activando notificaciones del pulso...")
        await cliente.start_notify(medida, recibir_pulso)
        suscrito = True

        print("Solicitando medición continua...")
        medicion_solicitada = True
        await escribir(cliente, control, b"\x15\x01\x01")

        carpeta = Path(__file__).resolve().parent / "datos"
        carpeta.mkdir(exist_ok=True)

        nombre = datetime.now().strftime(
            "pulso_%Y%m%d_%H%M%S_%f.csv"
        )
        archivo = carpeta / nombre

        with archivo.open(
            "w",
            newline="",
            encoding="utf-8",
        ) as salida:
            escritor = csv.writer(salida)
            escritor.writerow([
                "fecha_recepcion_utc",
                "direccion",
                "pulso_bpm",
                "contacto",
                "paquete_hex",
            ])
            salida.flush()

            print(f"Guardando lecturas en: {archivo}")
            print("Coloca bien la pulsera en tu muñeca.")
            print(
                "Comprobando si el sensor envía "
                "intervalos entre latidos..."
            )
            print("Presiona Ctrl+C para terminar.\n")

            reloj = asyncio.get_running_loop()
            ultima_lectura = reloj.time()
            ultimo_mantenimiento = reloj.time()

            while True:
                if not cliente.is_connected:
                    raise RuntimeError(
                        "The watch disconnected."
                    )

                # Consulta pasos, distancia y calorías
                # cuando el servidor lo solicita.
                if actualizar is not None:
                    await actualizar(cliente)

                ahora = reloj.time()

                if (
                    ahora - ultimo_mantenimiento
                    >= INTERVALO_MANTENIMIENTO
                ):
                    await escribir(cliente, control, b"\x16")
                    ultimo_mantenimiento = reloj.time()

                if (
                    reloj.time() - ultima_lectura
                    > TIEMPO_SIN_LECTURAS
                ):
                    raise RuntimeError(
                        "No valid readings were received for "
                        f"{TIEMPO_SIN_LECTURAS} seconds."
                    )

                try:
                    fecha, paquete = await asyncio.wait_for(
                        lecturas.get(),
                        timeout=1,
                    )
                except TimeoutError:
                    continue

                try:
                    pulso, contacto = interpretar_pulso(paquete)
                except ValueError as error:
                    print(f"Paquete descartado: {error}")
                    continue

                ultima_lectura = reloj.time()
                paquetes_procesados += 1

                # El pulso se conserva aunque el campo RR
                # falte o tenga un formato incorrecto.
                try:
                    intervalos_rr = extraer_rr_ms(paquete)
                except ValueError as error:
                    errores_rr += 1
                    intervalos_rr = []
                    print(f"Campo RR descartado: {error}")

                if publicar_rr is not None:
                    publicar_rr(fecha, intervalos_rr)

                if intervalos_rr:
                    paquetes_con_rr += 1
                    intervalos_recibidos += len(intervalos_rr)

                    if not rr_detectado:
                        rr_detectado = True
                        print(
                            "\nSe detectaron intervalos RR reales. "
                            "Podemos comenzar a evaluar "
                            "la captura para HRV.\n"
                        )

                    detalle_rr = ", ".join(
                        f"{rr:.2f}"
                        for rr in intervalos_rr
                    )

                    print(f"{fecha} | RR: [{detalle_rr}] ms")

                elif (
                    not paquete[0] & 0x10
                    and not aviso_sin_rr
                ):
                    aviso_sin_rr = True
                    print(
                        "\nEste paquete contiene pulso, "
                        "pero no intervalos RR. "
                        "Con este paquete no se puede calcular HRV.\n"
                    )

                # Guarda el paquete completo, incluidos
                # los intervalos RR si están presentes.
                escritor.writerow([
                    fecha,
                    DIRECCION,
                    pulso,
                    contacto,
                    paquete.hex(),
                ])
                salida.flush()

                # Mantiene la publicación existente hacia la web.
                if publicar is not None:
                    publicar(fecha, pulso)

                print(f"{fecha} | Pulso: {pulso} BPM")

    finally:
        print("\nResumen de captura:")
        print(f"Paquetes procesados: {paquetes_procesados}")
        print(f"Paquetes con RR extraídos: {paquetes_con_rr}")
        print(f"Intervalos RR recibidos: {intervalos_recibidos}")
        print(f"Errores al interpretar RR: {errores_rr}")

        if paquetes_procesados and not intervalos_recibidos:
            print(
                "No se extrajeron intervalos RR en esta sesión. "
                "HRV no puede calcularse con los datos recibidos."
            )

        if cliente.is_connected:
            if medicion_solicitada:
                with suppress(BleakError, TimeoutError):
                    await escribir(
                        cliente,
                        control,
                        b"\x15\x01\x00",
                    )

            if suscrito:
                with suppress(BleakError, TimeoutError):
                    await cliente.stop_notify(medida)


async def main():
    clave = solicitar_clave()

    print("\nBuscando tu Mi Band 5...")
    encontrados = await BleakScanner.discover(timeout=20)

    dispositivo = next(
        (
            encontrado
            for encontrado in encontrados
            if encontrado.address.lower() == DIRECCION.lower()
        ),
        None,
    )

    if dispositivo is None:
        raise RuntimeError(
            "Your Mi Band 5 was not found. "
            "Bring it closer, turn on its screen, "
            "and check Bluetooth."
        )

    print(f"Conectando a {dispositivo.address}...")

    async with BleakClient(dispositivo, timeout=30) as cliente:
        print("Conexión establecida.")
        await autenticar(cliente, clave)
        await leer_pulso(cliente)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(
            "\nPrograma terminado. "
            "Las lecturas recibidas quedaron guardadas."
        )
    except Exception:
        traceback.print_exc()
