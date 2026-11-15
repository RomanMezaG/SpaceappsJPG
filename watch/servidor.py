import asyncio
import csv
import math
import struct
import secrets
from time import monotonic
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from bleak import BleakClient, BleakScanner
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

import main as lector
import unir_historial as unificador
from activacion import EstimadorActivacion, METODO
from pai_prototipo import AcumuladorPAI
from perfil import PerfilSesion
from tendencia_pulso import leer_tendencia


BASE = Path(__file__).resolve().parent
ARCHIVO_HISTORIAL = BASE / "datos" / "historial_completo.csv"
ARCHIVO_RESUMEN = BASE / "datos" / "web" / "resumen_actual.csv"
estimador = None
acumulador_pai = None
perfil_actual = None
archivo_sesion = None
sesion_actual = None
ultima_senal_sesion = 0.0
tareas_sesion = []
bloqueo_sesion = asyncio.Lock()

UUID_RESUMEN = "00000007-0000-3512-2118-0009af100700"

COLUMNAS = [
    "fecha_utc",
    "pulso_bpm",
    "pasos_minuto",
    "pasos_acumulados",
    "distancia_calculada_m",
    "calorias_caminata_kcal",
    "pai_hoy_1_100",
    "pai_7dias_1_100",
    "estres_1_10",
]
COLUMNAS_SESION = COLUMNAS + [
    "pulso_fecha_utc", "resumen_fecha_utc", "estado_calculo", "perfil_id",
    "metodo_activacion", "metodo_pai",
]

ESTADO_INICIAL = {
    "fase": "esperando_perfil",
    "conectado": False,
    "pulso_bpm": None,
    "pulso_fecha_utc": None,
    "rr_ultimo_paquete_ms": None,
    "rr_fecha_utc": None,
    "rr_total_sesion": 0,
    "pasos_acumulados": None,
    "distancia_estimada_m": None,
    "calorias_estimadas_acumuladas_kcal": None,
    "resumen_fecha_utc": None,
    "error": None,
    "error_resumen": None,
    "error_historial": None,
    "activacion_estimada_1_10": None,
    "activacion_fecha_utc": None,
    "activacion_estado": "esperando",
    "activacion_detalle": "Waiting for recent heart rate and activity",
    "activacion_referencia_bpm": None,
    "actividad_pasos_minuto": None,
    "activacion_metodo": METODO,
    "error_activacion_archivo": None,
    "distancia_perfil_m": None,
    "calorias_perfil_kcal": None,
    "error_historial_sesion": None,
}
estado = dict(ESTADO_INICIAL)


def ahora_utc():
    return datetime.now(timezone.utc).isoformat()


def publicar_pulso(fecha, pulso):
    if pulso in (0, 255) or perfil_actual is None:
        return

    estado.update({
        "fase": "recibiendo",
        "pulso_bpm": pulso,
        "pulso_fecha_utc": fecha,
    })
    calculo = estimador.calcular(pulso, fecha)
    estado.update(calculo)
    acumulador_pai.registrar(
        fecha, pulso,
        calculo["activacion_referencia_bpm"],
        calculo["actividad_pasos_minuto"],
        disponible=calculo["activacion_estado"] == "estimando",
    )
    if calculo["activacion_estimada_1_10"] is not None:
        try:
            guardar_activacion(fecha, pulso, calculo)
            estado["error_activacion_archivo"] = None
        except OSError as error:
            estado["error_activacion_archivo"] = str(error)
    try:
        guardar_historial_sesion(fecha, pulso, calculo)
        estado["error_historial_sesion"] = None
    except (OSError, ValueError, csv.Error) as error:
        estado["error_historial_sesion"] = str(error)


def guardar_historial_sesion(fecha, pulso, calculo):
    if archivo_sesion is None:
        return
    pai = acumulador_pai.resumen()
    fecha_snapshot = ahora_utc()
    fecha_resumen = estado["resumen_fecha_utc"]
    resumen_reciente = False
    if fecha_resumen:
        edad = (
            datetime.fromisoformat(fecha_snapshot) - datetime.fromisoformat(fecha_resumen)
        ).total_seconds()
        resumen_reciente = 0 <= edad <= 45
    fila = {
        "fecha_utc": fecha_snapshot,
        "pulso_fecha_utc": fecha,
        "pulso_bpm": pulso,
        "pasos_minuto": calculo["actividad_pasos_minuto"],
        "pasos_acumulados": estado["pasos_acumulados"] if resumen_reciente else None,
        "distancia_calculada_m": estado["distancia_perfil_m"] if resumen_reciente else None,
        "calorias_caminata_kcal": estado["calorias_perfil_kcal"] if resumen_reciente else None,
        "pai_hoy_1_100": pai["pai_indice_hoy"],
        "pai_7dias_1_100": pai["pai_indice_7dias"],
        "estres_1_10": calculo["activacion_estimada_1_10"],
        "resumen_fecha_utc": fecha_resumen if resumen_reciente else None,
        "estado_calculo": calculo["activacion_estado"],
        "perfil_id": perfil_actual.identificador,
        "metodo_activacion": calculo["activacion_metodo"],
        "metodo_pai": pai["pai_prototipo_metodo"],
    }
    archivo_sesion.parent.mkdir(parents=True, exist_ok=True)
    cabecera = not archivo_sesion.exists() or archivo_sesion.stat().st_size == 0
    if not cabecera:
        with archivo_sesion.open("r", newline="", encoding="utf-8-sig") as entrada:
            if next(csv.reader(entrada), []) != COLUMNAS_SESION:
                raise ValueError("The session history columns are incompatible")
    with archivo_sesion.open("a", newline="", encoding="utf-8-sig") as salida:
        escritor = csv.DictWriter(salida, fieldnames=COLUMNAS_SESION)
        if cabecera:
            escritor.writeheader()
        escritor.writerow(fila)


def guardar_activacion(fecha, pulso, calculo):
    archivo_activacion = acumulador_pai.archivo.with_name("activacion_estimada.csv")
    archivo_activacion.parent.mkdir(parents=True, exist_ok=True)
    cabecera = not archivo_activacion.exists() or archivo_activacion.stat().st_size == 0
    columnas = [
        "fecha_utc", "pulso_bpm", "activacion_estimada_1_10",
        "referencia_bpm", "pasos_minuto_estimados", "metodo",
    ]
    with archivo_activacion.open("a", newline="", encoding="utf-8") as archivo:
        escritor = csv.writer(archivo)
        if cabecera:
            escritor.writerow(columnas)
        escritor.writerow([
            fecha, pulso, calculo["activacion_estimada_1_10"],
            calculo["activacion_referencia_bpm"],
            calculo["actividad_pasos_minuto"], METODO,
        ])


def publicar_intervalos_rr(fecha, intervalos):
    estado.update({
        "rr_ultimo_paquete_ms": list(intervalos),
        "rr_fecha_utc": fecha,
        "rr_total_sesion": (
            estado["rr_total_sesion"] + len(intervalos)
        ),
    })


def guardar_resumen(fecha, pasos, metros, calorias):
    ARCHIVO_RESUMEN.parent.mkdir(parents=True, exist_ok=True)

    necesita_cabecera = (
        not ARCHIVO_RESUMEN.exists()
        or ARCHIVO_RESUMEN.stat().st_size == 0
    )

    with ARCHIVO_RESUMEN.open(
        "a", newline="", encoding="utf-8"
    ) as archivo:
        escritor = csv.writer(archivo)

        if necesita_cabecera:
            escritor.writerow([
                "fecha_utc",
                "direccion",
                "pasos_acumulados",
                "distancia_estimada_m",
                "calorias_estimadas_kcal",
            ])

        escritor.writerow([
            fecha,
            lector.DIRECCION,
            pasos,
            metros,
            calorias,
        ])


async def conectar_pulsera():
    global estimador
    while True:
        estimador = EstimadorActivacion(perfil_actual.pulso_maximo_referencia)
        acumulador_pai.reiniciar_sesion()
        estado.update({
            "fase": "buscando",
            "conectado": False,
            "pulso_bpm": None,
            "pulso_fecha_utc": None,
            "rr_ultimo_paquete_ms": None,
            "rr_fecha_utc": None,
            "rr_total_sesion": 0,
            "pasos_acumulados": None,
            "distancia_estimada_m": None,
            "calorias_estimadas_acumuladas_kcal": None,
            "resumen_fecha_utc": None,
            "error": None,
            "error_resumen": None,
            "activacion_estimada_1_10": None,
            "activacion_fecha_utc": None,
            "activacion_estado": "esperando",
            "activacion_detalle": "Waiting for recent heart rate and activity",
            "activacion_referencia_bpm": None,
            "actividad_pasos_minuto": None,
            "error_activacion_archivo": None,
            "distancia_perfil_m": None,
            "calorias_perfil_kcal": None,
        })

        try:
            encontrados = await BleakScanner.discover(timeout=20)

            dispositivo = next(
                (
                    equipo for equipo in encontrados
                    if equipo.address.lower()
                    == lector.DIRECCION.lower()
                ),
                None,
            )

            if dispositivo is None:
                raise RuntimeError("Mi Band 5 was not found.")

            estado["fase"] = "conectando"

            async with BleakClient(
                dispositivo, timeout=30
            ) as cliente:
                estado["fase"] = "autenticando"

                await lector.autenticar(
                    cliente,
                    lector.solicitar_clave(),
                )

                estado.update({
                    "conectado": True,
                    "fase": "esperando_pulso",
                })

                proxima_consulta = 0.0

                async def actualizar_resumen(conexion):
                    nonlocal proxima_consulta

                    reloj = asyncio.get_running_loop()

                    if reloj.time() < proxima_consulta:
                        return

                    proxima_consulta = reloj.time() + 20

                    try:
                        paquete = bytes(await asyncio.wait_for(
                            conexion.read_gatt_char(
                                UUID_RESUMEN,
                                use_cached=False,
                            ),
                            timeout=5,
                        ))

                        if len(paquete) != 13:
                            raise ValueError(
                                "Unrecognized activity summary format: "
                                f"{len(paquete)} bytes."
                            )

                        _, pasos, metros, calorias = struct.unpack(
                            "<BIII", paquete
                        )
                        fecha = ahora_utc()
                        estimador.actualizar_actividad(pasos)
                        estado.update(perfil_actual.calcular_caminata(pasos))

                        estado.update({
                            "pasos_acumulados": pasos,
                            "distancia_estimada_m": metros,
                            "calorias_estimadas_acumuladas_kcal": calorias,
                            "resumen_fecha_utc": fecha,
                            "error_resumen": None,
                        })

                        guardar_resumen(
                            fecha, pasos, metros, calorias
                        )

                    except Exception as error:
                        estado["error_resumen"] = (
                            f"{type(error).__name__}: {error}"
                        )

                await lector.leer_pulso(
                    cliente,
                    publicar=publicar_pulso,
                    actualizar=actualizar_resumen,
                    publicar_rr=publicar_intervalos_rr,
                )

        except asyncio.CancelledError:
            raise

        except Exception as error:
            estado.update({
                "fase": "reintentando",
                "error": f"{type(error).__name__}: {error}",
            })

        finally:
            estado["conectado"] = False

        await asyncio.sleep(8)


async def actualizar_historial():
    while True:
        try:
            await asyncio.to_thread(unificador.consolidar)
            estado["error_historial"] = None

        except Exception as error:
            estado["error_historial"] = (
                f"{type(error).__name__}: {error}"
            )

        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(_app):
    vigilancia = asyncio.create_task(vigilar_sesion())
    try:
        yield
    finally:
        vigilancia.cancel()
        await asyncio.gather(vigilancia, return_exceptions=True)
        async with bloqueo_sesion:
            await detener_sesion()


app = FastAPI(lifespan=lifespan)


class CierreSesion(BaseModel):
    session_id: str


def validar_sesion(identificador):
    global ultima_senal_sesion
    if not sesion_actual or not identificador or not secrets.compare_digest(sesion_actual, identificador):
        raise HTTPException(status_code=409, detail="Complete your profile to start a new session.")
    ultima_senal_sesion = monotonic()


async def detener_sesion():
    global perfil_actual, sesion_actual, acumulador_pai, estimador, archivo_sesion
    for tarea in tareas_sesion:
        tarea.cancel()
    await asyncio.gather(*tareas_sesion, return_exceptions=True)
    tareas_sesion.clear()
    perfil_actual = None
    sesion_actual = None
    acumulador_pai = None
    estimador = None
    archivo_sesion = None
    estado.clear()
    estado.update(ESTADO_INICIAL)


async def vigilar_sesion():
    while True:
        await asyncio.sleep(5)
        async with bloqueo_sesion:
            if sesion_actual and monotonic() - ultima_senal_sesion > 60:
                await detener_sesion()


@app.post("/api/sesion/reiniciar")
async def reiniciar_sesion_web():
    async with bloqueo_sesion:
        await detener_sesion()
    return {"status": "esperando_perfil"}


@app.post("/api/sesion")
async def iniciar_sesion_web(perfil: PerfilSesion):
    global perfil_actual, sesion_actual, acumulador_pai, ultima_senal_sesion, archivo_sesion
    async with bloqueo_sesion:
        await detener_sesion()
        perfil_actual = perfil
        estado["fase"] = "preparando"
        carpeta = BASE / "datos" / "perfiles" / perfil.identificador
        archivo_sesion = carpeta / "historial_sesion.csv"
        acumulador_pai = AcumuladorPAI(carpeta / "pai_prototipo.csv", perfil)
        await asyncio.to_thread(acumulador_pai.cargar)
        try:
            await asyncio.to_thread(unificador.consolidar)
        except (OSError, ValueError, csv.Error) as error:
            estado["error_historial"] = str(error)
        await asyncio.to_thread(
            acumulador_pai.importar_historial, ARCHIVO_HISTORIAL, lector.DIRECCION,
        )
        sesion_actual = secrets.token_urlsafe(32)
        ultima_senal_sesion = monotonic()
        tareas_sesion.extend([
            asyncio.create_task(conectar_pulsera()),
            asyncio.create_task(actualizar_historial()),
        ])
        return {"session_id": sesion_actual, "status": "conectando"}


@app.post("/api/sesion/ping")
async def mantener_sesion(datos: CierreSesion):
    validar_sesion(datos.session_id)
    return {"status": "active"}


@app.post("/api/sesion/cerrar")
async def cerrar_sesion_web(datos: CierreSesion):
    async with bloqueo_sesion:
        if sesion_actual and secrets.compare_digest(sesion_actual, datos.session_id):
            await detener_sesion()
    return {"status": "closed"}


def numero_o_nulo(valor):
    try:
        if valor is None or str(valor).strip() == "":
            return None

        numero = float(valor)
        return numero if math.isfinite(numero) else None

    except (TypeError, ValueError):
        return None


@app.get("/api/datos")
async def obtener_datos(x_watch_session: str | None = Header(default=None)):
    validar_sesion(x_watch_session)
    actual = dict(estado)
    actual.update(acumulador_pai.resumen())

    fecha_pulso = actual["pulso_fecha_utc"]
    edad_pulso = None

    if fecha_pulso:
        edad_pulso = (
            datetime.now(timezone.utc)
            - datetime.fromisoformat(fecha_pulso)
        ).total_seconds()

    actual["pulso_reciente"] = bool(
        actual["conectado"]
        and edad_pulso is not None
        and edad_pulso <= 30
    )

    if not actual["pulso_reciente"]:
        actual["pulso_bpm"] = None
        actual["activacion_estimada_1_10"] = None
        actual["activacion_estado"] = "sin_pulso_reciente"
        actual["activacion_detalle"] = "Waiting for a recent heart rate reading"

    historial = []
    error_archivo = None

    try:
        if archivo_sesion is not None and archivo_sesion.is_file():
            with archivo_sesion.open(
                "r", newline="", encoding="utf-8-sig"
            ) as archivo:
                ultimas = deque(
                    csv.DictReader(archivo),
                    maxlen=120,
                )

            for original in ultimas:
                fila = {
                    "fecha_utc": original.get("fecha_utc", "")
                }

                for columna in COLUMNAS[1:]:
                    fila[columna] = numero_o_nulo(
                        original.get(columna)
                    )
                fila["estado_calculo"] = original.get("estado_calculo", "")

                historial.append(fila)

    except (OSError, csv.Error) as error:
        error_archivo = str(error)

    return {
        "estado": actual,
        "columnas": COLUMNAS,
        "historial": historial,
        "archivo_historial": archivo_sesion.name if archivo_sesion is not None else "historial_sesion.csv",
        "error_archivo": error_archivo,
    }


@app.get("/api/pulso/tendencia")
async def obtener_tendencia_pulso(x_watch_session: str | None = Header(default=None)):
    validar_sesion(x_watch_session)
    if not ARCHIVO_HISTORIAL.is_file():
        raise HTTPException(status_code=404, detail="No saved heart-rate history is available yet.")
    try:
        return await asyncio.to_thread(leer_tendencia, ARCHIVO_HISTORIAL, lector.DIRECCION)
    except (OSError, csv.Error) as error:
        raise HTTPException(status_code=423, detail="Could not read saved heart-rate history. Try again shortly.") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/historial.csv")
async def exportar_historial(x_watch_session: str | None = Header(default=None)):
    validar_sesion(x_watch_session)
    if archivo_sesion is None or not archivo_sesion.is_file():
        raise HTTPException(status_code=404, detail="No readings are available for this session yet.")
    try:
        contenido = archivo_sesion.read_bytes()
    except OSError as error:
        raise HTTPException(status_code=423, detail="Could not read the session history.") from error
    return Response(content=contenido, media_type="text/csv", headers={
        "Content-Disposition": 'attachment; filename="historial_sesion.csv"',
    })
