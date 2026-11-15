import asyncio
import csv
import math
import struct
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from bleak import BleakClient, BleakScanner
from fastapi import FastAPI

import main as lector
import unir_historial as unificador


BASE = Path(__file__).resolve().parent
ARCHIVO_HISTORIAL = BASE / "datos" / "historial_completo.csv"
ARCHIVO_RESUMEN = BASE / "datos" / "web" / "resumen_actual.csv"

UUID_RESUMEN = "00000007-0000-3512-2118-0009af100700"

COLUMNAS = [
    "fecha_utc",
    "pulso_bpm",
    "pasos_minuto",
    "pasos_acumulados",
    "distancia_estimada_m",
    "calorias_estimadas_acumuladas_kcal",
    "pai_hoy",
    "pai_total",
    "estres",
]

estado = {
    "fase": "iniciando",
    "conectado": False,
    "pulso_bpm": None,
    "pulso_fecha_utc": None,
    "pasos_acumulados": None,
    "distancia_estimada_m": None,
    "calorias_estimadas_acumuladas_kcal": None,
    "resumen_fecha_utc": None,
    "error": None,
    "error_resumen": None,
    "error_historial": None,
}


def ahora_utc():
    return datetime.now(timezone.utc).isoformat()


def publicar_pulso(fecha, pulso):
    if pulso in (0, 255):
        return

    estado.update({
        "fase": "recibiendo",
        "pulso_bpm": pulso,
        "pulso_fecha_utc": fecha,
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
    while True:
        estado.update({
            "fase": "buscando",
            "conectado": False,
            "pulso_bpm": None,
            "pulso_fecha_utc": None,
            "pasos_acumulados": None,
            "distancia_estimada_m": None,
            "calorias_estimadas_acumuladas_kcal": None,
            "resumen_fecha_utc": None,
            "error": None,
            "error_resumen": None,
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
                raise RuntimeError("No se encontró la Mi Band 5.")

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
                                "Formato de resumen no reconocido: "
                                f"{len(paquete)} bytes."
                            )

                        _, pasos, metros, calorias = struct.unpack(
                            "<BIII", paquete
                        )
                        fecha = ahora_utc()

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
    tareas = [
        asyncio.create_task(conectar_pulsera()),
        asyncio.create_task(actualizar_historial()),
    ]

    try:
        yield
    finally:
        for tarea in tareas:
            tarea.cancel()

        await asyncio.gather(*tareas, return_exceptions=True)


app = FastAPI(lifespan=lifespan)


def numero_o_nulo(valor):
    try:
        if valor is None or str(valor).strip() == "":
            return None

        numero = float(valor)
        return numero if math.isfinite(numero) else None

    except (TypeError, ValueError):
        return None


@app.get("/api/datos")
def obtener_datos():
    actual = dict(estado)

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

    historial = []
    error_archivo = None

    try:
        if ARCHIVO_HISTORIAL.is_file():
            with ARCHIVO_HISTORIAL.open(
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

                historial.append(fila)

    except (OSError, csv.Error) as error:
        error_archivo = str(error)

    return {
        "estado": actual,
        "columnas": COLUMNAS,
        "historial": historial,
        "archivo_historial": ARCHIVO_HISTORIAL.name,
        "error_archivo": error_archivo,
    }