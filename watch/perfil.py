"""Parámetros introducidos para la sesión; sin valores personales predeterminados."""

from hashlib import sha256
from pydantic import BaseModel, ConfigDict, Field


class PerfilSesion(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    edad: int = Field(ge=18, le=100)
    estatura_cm: float = Field(ge=120, le=230)
    peso_kg: float = Field(ge=30, le=250)

    @property
    def identificador(self):
        canonico = f"perfil_v2:{self.edad}:{self.estatura_cm:.1f}:{self.peso_kg:.1f}"
        return sha256(canonico.encode("utf-8")).hexdigest()[:24]

    @property
    def pulso_maximo_referencia(self):
        # Predicción poblacional de Tanaka, no máximo individual medido.
        return 208.0 - 0.7 * self.edad

    def calcular_caminata(self, pasos):
        # Factor de paso elegido para el prototipo; requiere calibración individual.
        longitud_paso_m = 0.41 * self.estatura_cm / 100.0
        distancia_m = max(0, pasos) * longitud_paso_m
        # Coste neto aproximado de caminar en llano, no gasto energético diario total.
        calorias = 0.5 * self.peso_kg * distancia_m / 1000.0
        return {
            "distancia_perfil_m": round(distancia_m, 1),
            "calorias_perfil_kcal": round(calorias, 1),
        }
