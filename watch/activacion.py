"""Índice experimental de activación; reglas del prototipo, no HRV ni diagnóstico."""

from collections import deque
from math import exp, isfinite
from statistics import median
from time import monotonic


METODO = "bpm_actividad_perfil_v2_experimental"


class EstimadorActivacion:
    def __init__(self, pulso_maximo=None):
        self.pulso_maximo = pulso_maximo
        self.pasos = deque()
        self.pulsos = deque()
        self.calibracion = deque()
        self.referencia = None
        self.puntuacion = None
        self.ultimo_calculo = None

    def actualizar_actividad(self, pasos):
        ahora = monotonic()
        if not isinstance(pasos, (int, float)) or not isfinite(pasos) or pasos < 0:
            return
        if self.pasos and pasos < self.pasos[-1][1]:
            # Reinicio del contador diario: no interpretar la caída como reposo.
            self.pasos.clear()
            self.calibracion.clear()
        self.pasos.append((ahora, pasos))
        while len(self.pasos) > 2 and self.pasos[1][0] < ahora - 60:
            self.pasos.popleft()

    def calcular(self, pulso, fecha):
        ahora = monotonic()
        resultado = {
            "activacion_estimada_1_10": None,
            "activacion_fecha_utc": None,
            "activacion_estado": "esperando",
            "activacion_detalle": "Waiting for recent heart rate and activity",
            "activacion_referencia_bpm": self.referencia,
            "actividad_pasos_minuto": None,
            "activacion_metodo": METODO,
        }

        def pendiente(estado, detalle):
            self.puntuacion = None
            self.ultimo_calculo = None
            resultado.update(activacion_estado=estado, activacion_detalle=detalle)
            return resultado

        if not isfinite(pulso) or not 30 <= pulso <= 220:
            self.calibracion.clear()
            self.pulsos.clear()
            return pendiente("pulso_invalido", "Heart rate is outside the technical range of the prototype")

        if self.pulsos and ahora - self.pulsos[-1][0] > 15:
            self.pulsos.clear()
            self.calibracion.clear()
        self.pulsos.append((ahora, pulso))
        while self.pulsos and self.pulsos[0][0] < ahora - 30:
            self.pulsos.popleft()

        if len(self.pasos) < 2 or ahora - self.pasos[-1][0] > 45:
            self.calibracion.clear()
            return pendiente("sin_actividad", "Waiting for two recent step summaries")

        inicio, pasos_inicio = self.pasos[0]
        fin, pasos_fin = self.pasos[-1]
        if fin - inicio < 15:
            self.calibracion.clear()
            return pendiente("sin_actividad", "Collecting activity data")

        cadencia = max(0.0, (pasos_fin - pasos_inicio) * 60 / (fin - inicio))
        resultado["actividad_pasos_minuto"] = round(cadencia, 1)

        if self.referencia is None:
            if cadencia > 5:
                self.calibracion.clear()
                return pendiente("calibrando", "Sit quietly for 60 seconds to establish the baseline")
            self.calibracion.append((ahora, pulso))
            duracion = ahora - self.calibracion[0][0]
            if duracion < 60 or len(self.calibracion) < 12:
                restante = max(0, int(60 - duracion) + 1)
                return pendiente("calibrando", f"Establishing session baseline · approximately {restante} s")
            self.referencia = float(median(valor for _, valor in self.calibracion))
            self.calibracion.clear()
            resultado["activacion_referencia_bpm"] = self.referencia

        if len(self.pulsos) < 5:
            return pendiente("reuniendo_pulso", "Collecting at least five recent readings")

        pulso_suavizado = median(valor for _, valor in self.pulsos)
        # Constantes de demostración: no proceden de un algoritmo clínico entrenado.
        compensacion = min(30.0, 0.35 * cadencia)
        exceso = max(0.0, pulso_suavizado - self.referencia - compensacion)
        reserva = self.pulso_maximo - self.referencia if self.pulso_maximo is not None else 0
        if reserva <= 0:
            return pendiente("referencia_invalida", "The heart rate baseline needs recalibration")
        objetivo = 1.0 + 9.0 * min(1.0, exceso / (0.35 * reserva))

        if self.puntuacion is None:
            self.puntuacion = objetivo
        else:
            alpha = 1.0 - exp(-(ahora - self.ultimo_calculo) / 15.0)
            self.puntuacion += alpha * (objetivo - self.puntuacion)
        self.ultimo_calculo = ahora

        resultado.update({
            "activacion_estimada_1_10": round(self.puntuacion, 1),
            "activacion_fecha_utc": fecha,
            "activacion_estado": "estimando",
            "activacion_detalle": "Experimental index based on BPM and activity; not measured stress",
        })
        return resultado
