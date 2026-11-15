import csv
import os
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path


CARPETA = Path(__file__).resolve().parent / "datos"
CSV_ORIGINAL = CARPETA / "historial_completo.csv"

DIAS = 7
SEMILLA = 42
ABRIR_TABLA = True

# Desfase fijo para esta simulación.
# UTC-8 corresponde al horario de Tijuana en noviembre.
ZONA_SIMULACION = timezone(timedelta(hours=-8))

ESCENARIOS = [
    "rutina",
    "rutina",
    "ejercicio",
    "carga_alta",
    "descanso_corto",
    "recuperacion",
    "rutina",
]


def categoria_estres(valor):
    if valor < 40:
        return "relajado"
    if valor < 60:
        return "leve"
    if valor < 80:
        return "moderado"
    return "alto"


def generar():
    if not CSV_ORIGINAL.is_file():
        raise FileNotFoundError(
            f"No se encontró el CSV original:\n{CSV_ORIGINAL}"
        )

    with CSV_ORIGINAL.open(
        "r", newline="", encoding="utf-8-sig"
    ) as archivo:
        columnas = csv.DictReader(archivo).fieldnames

    if not columnas:
        raise ValueError("El CSV original no contiene encabezados.")

    adicionales = [
        "dato_simulado",
        "escenario",
        "actividad_simulada",
        "fecha_local_simulada",
        "sueno_simulado",
    ]

    columnas = columnas + [
        nombre for nombre in adicionales
        if nombre not in columnas
    ]

    nombre = datetime.now().strftime(
        "historial_simulado_%Y%m%d_%H%M%S_%f.csv"
    )
    destino = CARPETA / nombre

    azar = random.Random(SEMILLA)

    # Simula los últimos días completos.
    inicio = (
        datetime.now(ZONA_SIMULACION)
        .replace(hour=0, minute=0, second=0, microsecond=0)
        - timedelta(days=DIAS)
    )

    pai_dias_anteriores = []
    pulso_anterior = 65.0
    estres_anterior = 25.0
    registros = 0

    with destino.open(
        "w", newline="", encoding="utf-8-sig"
    ) as archivo:
        escritor = csv.DictWriter(archivo, fieldnames=columnas)
        escritor.writeheader()

        for dia in range(DIAS):
            escenario = ESCENARIOS[dia % len(ESCENARIOS)]

            pasos_acumulados = 0
            calorias_acumuladas = 0.0
            pai_hoy = 0.0

            despertar = 5 if escenario == "descanso_corto" else 7

            for minuto in range(24 * 60):
                fecha = inicio + timedelta(days=dia, minutes=minuto)

                dormido = (
                    minuto < despertar * 60
                    or minuto >= 23 * 60
                )

                ejercicio = (
                    not dormido
                    and 17 * 60 <= minuto < 17 * 60 + 45
                )

                caminando = (
                    not dormido
                    and (
                        8 * 60 + 15 <= minuto < 8 * 60 + 35
                        or 13 * 60 <= minuto < 13 * 60 + 15
                    )
                )

                trabajando = (
                    not dormido
                    and 9 * 60 <= minuto < 16 * 60
                )

                if dormido:
                    actividad = "sueno"
                    objetivo_pulso = 55
                    objetivo_estres = 15
                    pasos = 0
                    calorias_minuto = 0.0
                    aporte_pai = 0.0

                elif ejercicio:
                    actividad = "ejercicio"
                    objetivo_pulso = 125
                    objetivo_estres = 45
                    pasos = azar.randint(90, 130)
                    calorias_minuto = azar.uniform(6.5, 8.5)

                    # Regla ficticia para mostrar PAI en la interfaz.
                    aporte_pai = 0.35

                elif caminando:
                    actividad = "caminata"
                    objetivo_pulso = 95
                    objetivo_estres = 30
                    pasos = azar.randint(70, 105)
                    calorias_minuto = azar.uniform(2.5, 4.0)
                    aporte_pai = 0.03

                else:
                    actividad = "trabajo" if trabajando else "reposo"
                    objetivo_pulso = 76 if trabajando else 66
                    objetivo_estres = 38 if trabajando else 24
                    pasos = azar.randint(0, 5)

                    # Solo gasto de actividad ficticio.
                    # No representa gasto energético total ni alimentación.
                    calorias_minuto = pasos * 0.04
                    aporte_pai = 0.0

                if escenario == "carga_alta" and trabajando:
                    objetivo_pulso += 10
                    objetivo_estres += 32

                if escenario == "descanso_corto" and not dormido:
                    objetivo_pulso += 6
                    objetivo_estres += 12

                if escenario == "recuperacion" and not ejercicio:
                    objetivo_estres = max(10, objetivo_estres - 8)

                # Cambios graduales para evitar saltos entre minutos.
                pulso_anterior += (
                    0.18 * (objetivo_pulso - pulso_anterior)
                    + azar.gauss(0, 1.2)
                )
                estres_anterior += (
                    0.12 * (objetivo_estres - estres_anterior)
                    + azar.gauss(0, 1.0)
                )

                pulso = round(max(45, min(165, pulso_anterior)))
                estres = round(max(0, min(100, estres_anterior)))

                pasos_acumulados += pasos
                calorias_acumuladas += calorias_minuto
                pai_hoy += aporte_pai

                pai_total = sum(pai_dias_anteriores[-6:]) + pai_hoy

                fila = dict.fromkeys(columnas, "")

                fila.update({
                    "fecha_utc": fecha.astimezone(
                        timezone.utc
                    ).isoformat(timespec="microseconds"),

                    "direccion": "SIMULACION-001",
                    "tipo_registro": "simulacion_minuto",
                    "referencia_temporal": "tiempo_simulado",

                    "pulso_bpm": pulso,
                    "pasos_minuto": pasos,
                    "pasos_acumulados": pasos_acumulados,

                    # Conversión ficticia para esta demostración.
                    "distancia_estimada_m": round(
                        pasos_acumulados * 0.70, 1
                    ),

                    "calorias_estimadas_acumuladas_kcal": round(
                        calorias_acumuladas, 2
                    ),

                    "pai_hoy": round(pai_hoy, 2),
                    "pai_total": round(pai_total, 2),

                    "estres": estres,
                    "categoria_estres": categoria_estres(estres),

                    "contacto": "simulado",
                    "registro_original_hex": "",
                    "archivos_origen": "generador_sintetico",

                    "dato_simulado": True,
                    "escenario": escenario,
                    "actividad_simulada": actividad,
                    "fecha_local_simulada": fecha.isoformat(),
                    "sueno_simulado": dormido,
                })

                escritor.writerow(fila)
                registros += 1

            pai_dias_anteriores.append(pai_hoy)

    print("\nSimulación generada.")
    print(f"Días: {DIAS}")
    print(f"Registros: {registros}")
    print(f"Archivo:\n{destino}")
    print("\nTodos los valores son ficticios.")

    if ABRIR_TABLA:
        try:
            os.startfile(str(destino))
        except OSError:
            print("Puedes abrir el CSV manualmente.")

    return destino


if __name__ == "__main__":
    try:
        generar()
    except (OSError, ValueError, csv.Error) as error:
        print(f"\nError: {error}")