import csv
import math
from datetime import datetime
from pathlib import Path


CARPETA = Path(__file__).resolve().parent / "datos"

ENTRADA = CARPETA / "historial_completo_rellenado.csv"
SALIDA = CARPETA / "dataset_modelo.csv"

VARIABLES = [
    "pulso_bpm",
    "pasos_minuto",
    "pasos_acumulados",
    "distancia_estimada_m",
    "calorias_estimadas_acumuladas_kcal",
    "pai_hoy",
    "pai_total",
    "estres",
]

ENTEROS = {
    "pulso_bpm",
    "pasos_minuto",
    "pasos_acumulados",
    "estres",
}


def generar_dataset():
    registros = []

    with ENTRADA.open(
        "r", newline="", encoding="utf-8-sig"
    ) as archivo:
        lector = csv.DictReader(archivo)

        necesarias = {"fecha_utc", *VARIABLES}
        faltantes = necesarias - set(lector.fieldnames or [])

        if faltantes:
            raise ValueError(
                f"Faltan columnas: {sorted(faltantes)}"
            )

        for numero_fila, original in enumerate(lector, start=2):
            fecha_texto = original["fecha_utc"].strip()
            fecha = datetime.fromisoformat(
                fecha_texto.replace("Z", "+00:00")
            )

            if fecha.tzinfo is None:
                raise ValueError(
                    f"Fila {numero_fila}: fecha sin zona horaria."
                )

            fila = {"fecha_utc": fecha_texto}

            for variable in VARIABLES:
                texto = (original.get(variable) or "").strip()

                try:
                    valor = float(texto)
                except ValueError:
                    raise ValueError(
                        f"Fila {numero_fila}: "
                        f"{variable} no contiene un número."
                    ) from None

                if not math.isfinite(valor) or valor < 0:
                    raise ValueError(
                        f"Fila {numero_fila}: "
                        f"{variable} contiene un valor no utilizable."
                    )

                if variable in ENTEROS:
                    if not valor.is_integer():
                        raise ValueError(
                            f"Fila {numero_fila}: "
                            f"{variable} debe ser entero."
                        )
                    fila[variable] = int(valor)
                else:
                    fila[variable] = valor

            registros.append((fecha, fila))

    if not registros:
        raise ValueError("El archivo de entrada está vacío.")

    registros.sort(key=lambda elemento: elemento[0])

    with SALIDA.open(
        "w", newline="", encoding="utf-8-sig"
    ) as archivo:
        escritor = csv.DictWriter(
            archivo,
            fieldnames=["fecha_utc", *VARIABLES],
        )
        escritor.writeheader()
        escritor.writerows(
            fila for _fecha, fila in registros
        )

    print(f"\nDataset preparado: {len(registros)} registros.")
    print(f"Variables numéricas: {len(VARIABLES)}")
    print(f"Archivo:\n{SALIDA}")

    return SALIDA


if __name__ == "__main__":
    try:
        generar_dataset()
    except (OSError, ValueError, csv.Error) as error:
        print(f"\nError: {error}")