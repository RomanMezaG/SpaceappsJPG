"""Puntos propios de actividad: no reproduce el PAI del fabricante."""

import csv
import json
from contextlib import suppress
from datetime import date, datetime, timedelta, timezone
from math import isfinite
from threading import RLock
from uuid import uuid4

from pai_historico import COLUMNAS_HISTORICO, METODO_HISTORICO, reconstruir, tasa_puntos


METODO_PAI = "actividad_perfil_v2"
PUNTOS_REFERENCIA_ESCALA = 100.0


def indice_pai(puntos):
    """Escala visual propia 1..100; no cambia las contribuciones guardadas."""
    proporcion = min(1.0, max(0.0, puntos) / PUNTOS_REFERENCIA_ESCALA)
    return min(100, max(1, int(1.0 + 99.0 * proporcion + 0.5)))


COLUMNAS = [
    "fecha_inicio_utc", "fecha_fin_utc", "dia_local", "duracion_s",
    "puntos", "puntos_minuto", "pulso_bpm", "referencia_bpm",
    "pasos_minuto", "metodo",
]


class AcumuladorPAI:
    def __init__(self, archivo, perfil):
        self.archivo = archivo
        self.perfil = perfil
        self.totales = {}
        self.totales_historicos = {}
        self.archivo_historico = archivo.with_name("pai_historico.csv")
        self.informe_importacion = None
        self.error_importacion = None
        self.anterior = None
        self.cargado = False
        self.error = None
        self.fase = "esperando_referencia"
        self.bloqueo = RLock()

    def cargar(self):
        with self.bloqueo:
            try:
                totales = {}
                if self.archivo.exists():
                    with self.archivo.open("r", newline="", encoding="utf-8") as entrada:
                        lector = csv.DictReader(entrada)
                        if lector.fieldnames != COLUMNAS:
                            raise ValueError("The activity points history has incompatible columns")
                        for fila in lector:
                            dia = date.fromisoformat(fila["dia_local"])
                            puntos = float(fila["puntos"])
                            if not isfinite(puntos) or puntos < 0 or fila["metodo"] != METODO_PAI:
                                raise ValueError("Invalid activity points record or unsupported version")
                            totales[dia] = totales.get(dia, 0.0) + puntos
                self.totales = totales
                self.totales_historicos = self._leer_historico()
                self.cargado = True
                self.error = None
            except (OSError, ValueError, csv.Error, KeyError) as error:
                self.cargado = False
                self.error = str(error)

    def _leer_historico(self):
        totales = {}
        if self.archivo_historico.exists():
            with self.archivo_historico.open("r", newline="", encoding="utf-8") as entrada:
                lector = csv.DictReader(entrada)
                if lector.fieldnames != COLUMNAS_HISTORICO:
                    raise ValueError("The imported activity points history has incompatible columns")
                for fila in lector:
                    dia = date.fromisoformat(fila["dia_local"])
                    puntos = float(fila["puntos"])
                    if not isfinite(puntos) or puntos < 0 or fila["metodo"] != METODO_HISTORICO:
                        raise ValueError("Invalid historical contribution")
                    totales[dia] = totales.get(dia, 0.0) + puntos
        return totales

    def importar_historial(self, archivo, direccion):
        # Ejecutar al arrancar, antes de crear la conexión BLE. Se reconstruye el
        # archivo derivado completo: importar otra vez no vuelve a añadir puntos.
        with self.bloqueo:
            if not self.cargado:
                return
            temporal = self.archivo_historico.with_name(f"pai_historico.{uuid4().hex}.tmp")
            try:
                filas, informe = reconstruir(archivo, self.archivo, direccion, self.perfil)
                totales = {}
                for fila in filas:
                    dia = date.fromisoformat(fila["dia_local"])
                    totales[dia] = totales.get(dia, 0.0) + fila["puntos"]
                self.archivo_historico.parent.mkdir(parents=True, exist_ok=True)
                with temporal.open("w", newline="", encoding="utf-8") as salida:
                    escritor = csv.DictWriter(salida, fieldnames=COLUMNAS_HISTORICO)
                    escritor.writeheader()
                    escritor.writerows(filas)
                temporal.replace(self.archivo_historico)
                self.totales_historicos = totales
                self.informe_importacion = informe
                self.error_importacion = None
                print(f"PAI histórico: {len(filas)} minutos importados sin duplicar el tiempo en vivo.")
                ruta_informe = self.archivo_historico.with_name("pai_importacion.json")
                try:
                    with ruta_informe.open("w", encoding="utf-8") as salida:
                        json.dump(informe, salida, ensure_ascii=False, indent=2)
                except OSError as error:
                    self.error_importacion = f"Points imported; could not save the report: {error}"
            except (OSError, ValueError, csv.Error, KeyError) as error:
                self.error_importacion = str(error)
                print(f"PAI histórico: {error}. Se conservan los puntos anteriores.")
            finally:
                with suppress(OSError):
                    temporal.unlink(missing_ok=True)

    def reiniciar_sesion(self):
        with self.bloqueo:
            # Conserva los puntos guardados; no suma tiempo durante la desconexión.
            self.anterior = None
            self.fase = "esperando_referencia"

    def registrar(self, fecha, pulso, referencia, cadencia, disponible):
        with self.bloqueo:
            if not self.cargado:
                return
            if not disponible or referencia is None or cadencia is None:
                self.anterior = None
                self.fase = "esperando_referencia"
                return
            valores = (pulso, referencia, cadencia)
            if any(not isfinite(v) for v in valores) or referencia <= 0:
                self.anterior = None
                return

            fin = datetime.fromisoformat(fecha).astimezone(timezone.utc)
            tasa = tasa_puntos(pulso, referencia, cadencia, self.perfil)
            self.fase = "sumando" if tasa else "en_pausa"

            anterior = self.anterior
            self.anterior = (fin, tasa)
            if anterior is None:
                return
            inicio, tasa_anterior = anterior
            duracion = (fin - inicio).total_seconds()
            if not 0 < duracion <= 15:
                return

            # Conservador ante cambios de intensidad: usa la menor tasa del par.
            tasa_intervalo = min(tasa_anterior, tasa)
            filas = []
            while inicio < fin:
                dia = inicio.astimezone().date()
                manana = dia + timedelta(days=1)
                medianoche = datetime.combine(manana, datetime.min.time()).astimezone()
                corte = min(fin, medianoche.astimezone(timezone.utc))
                segundos = (corte - inicio).total_seconds()
                puntos = tasa_intervalo * segundos / 60.0
                filas.append({
                    "fecha_inicio_utc": inicio.isoformat(),
                    "fecha_fin_utc": corte.isoformat(),
                    "dia_local": dia.isoformat(),
                    "duracion_s": segundos,
                    "puntos": puntos,
                    "puntos_minuto": tasa_intervalo,
                    "pulso_bpm": pulso,
                    "referencia_bpm": referencia,
                    "pasos_minuto": cadencia,
                    "metodo": METODO_PAI,
                })
                inicio = corte

            try:
                self.archivo.parent.mkdir(parents=True, exist_ok=True)
                cabecera = not self.archivo.exists() or self.archivo.stat().st_size == 0
                with self.archivo.open("a", newline="", encoding="utf-8") as salida:
                    escritor = csv.DictWriter(salida, fieldnames=COLUMNAS)
                    if cabecera:
                        escritor.writeheader()
                    escritor.writerows(filas)
                for fila in filas:
                    dia = date.fromisoformat(fila["dia_local"])
                    self.totales[dia] = self.totales.get(dia, 0.0) + fila["puntos"]
                self.error = None
            except (OSError, csv.Error) as error:
                # El reloj continúa funcionando aunque el archivo esté bloqueado.
                self.error = str(error)

    def resumen(self):
        with self.bloqueo:
            hoy = datetime.now().astimezone().date()
            primero = hoy - timedelta(days=6)
            dias = set(self.totales) | set(self.totales_historicos)
            combinado = {
                dia: self.totales.get(dia, 0.0) + self.totales_historicos.get(dia, 0.0)
                for dia in dias
            }
            puntos_hoy = combinado.get(hoy, 0.0)
            puntos_semana = sum(
                puntos for dia, puntos in combinado.items()
                if primero <= dia <= hoy
            )
            return {
                "pai_indice_hoy": indice_pai(puntos_hoy) if self.cargado else None,
                "pai_indice_7dias": indice_pai(puntos_semana) if self.cargado else None,
                "pai_escala_min": 1,
                "pai_escala_max": 100,
                "pai_puntos_referencia_escala": PUNTOS_REFERENCIA_ESCALA,
                "pai_prototipo_hoy": round(combinado.get(hoy, 0.0), 2) if self.cargado else None,
                "pai_prototipo_7dias": round(sum(
                    puntos for dia, puntos in combinado.items()
                    if primero <= dia <= hoy
                ), 2) if self.cargado else None,
                "pai_prototipo_estado": self.fase,
                "pai_prototipo_metodo": METODO_PAI,
                "pai_prototipo_error": self.error,
                "pai_prototipo_archivo": self.archivo.name,
                "pai_historico_error": self.error_importacion,
                "pai_historico_informe": self.informe_importacion,
            }
