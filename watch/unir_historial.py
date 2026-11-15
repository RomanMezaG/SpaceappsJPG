import csv
from datetime import datetime, timezone
from pathlib import Path


CARPETA_PROYECTO = Path(__file__).resolve().parent
CARPETA_DATOS = CARPETA_PROYECTO / "datos"
ARCHIVO_SALIDA = CARPETA_DATOS / "historial_completo.csv"

COLUMNAS = [
    "fecha_utc",
    "direccion",
    "tipo_registro",
    "referencia_temporal",
    "pulso_bpm",
    "pasos_minuto",
    "pasos_acumulados",
    "distancia_estimada_m",
    "calorias_estimadas_acumuladas_kcal",
    "pai_hoy",
    "pai_total",
    "estres",
    "categoria_estres",
    "contacto",
    "registro_original_hex",
]


def texto(fila, columna):
    return (fila.get(columna) or "").strip()


def identificar_archivo(ruta):
    nombre = ruta.name.lower()

    nombres = {
        "actividad.csv": "actividad_minuto",
        "resumen_actual.csv": "resumen_acumulado",
        "pulso_manual.csv": "pulso_manual",
        "estres_automatico.csv": "estres_automatico",
        "estres_manual.csv": "estres_manual",
        "pai.csv": "pai",
    }

    if nombre in nombres:
        return nombres[nombre]

    if nombre.startswith("pulso_") and nombre.endswith(".csv"):
        return "pulso_en_vivo"

    return None


def obtener_fecha(fila):
    valor = (
        texto(fila, "fecha_utc")
        or texto(fila, "fecha_recepcion_utc")
    )

    if valor:
        fecha = datetime.fromisoformat(
            valor.replace("Z", "+00:00")
        )

        if fecha.tzinfo is None:
            raise ValueError("The timestamp does not include a time zone.")

        return fecha.astimezone(timezone.utc)

    segundos = texto(fila, "epoch_s")

    if segundos:
        return datetime.fromtimestamp(
            float(segundos), timezone.utc
        )

    raise ValueError("The record does not contain a recognizable timestamp.")


def normalizar(fila, tipo):
    fecha = obtener_fecha(fila)
    resultado = dict.fromkeys(COLUMNAS, "")

    resultado.update({
        "fecha_utc": fecha.isoformat(timespec="microseconds"),
        "direccion": texto(fila, "direccion").upper(),
        "tipo_registro": tipo,
        "referencia_temporal": "medicion_pulsera",
    })

    if tipo in (
        "pulso_en_vivo",
        "pulso_manual",
        "actividad_minuto",
    ):
        resultado["pulso_bpm"] = texto(fila, "pulso_bpm")

    if tipo == "pulso_en_vivo":
        resultado.update({
            "referencia_temporal": "recepcion_PC",
            "contacto": texto(fila, "contacto"),
            "registro_original_hex": texto(fila, "paquete_hex"),
        })

    elif tipo == "actividad_minuto":
        resultado.update({
            "pasos_minuto": texto(fila, "pasos_minuto"),
            "registro_original_hex": texto(fila, "registro_hex"),
        })

    elif tipo == "resumen_acumulado":
        resultado.update({
            "referencia_temporal": "consulta_PC",
            "pasos_acumulados": texto(fila, "pasos_acumulados"),
            "distancia_estimada_m": texto(
                fila, "distancia_estimada_m"
            ),
            "calorias_estimadas_acumuladas_kcal": texto(
                fila, "calorias_estimadas_kcal"
            ),
        })

    elif tipo in ("estres_automatico", "estres_manual"):
        resultado.update({
            "estres": texto(fila, "estres"),
            "categoria_estres": texto(
                fila, "categoria_fabricante"
            ),
        })

    elif tipo == "pai":
        resultado.update({
            "pai_hoy": texto(fila, "pai_hoy"),
            "pai_total": texto(fila, "pai_total"),
            "registro_original_hex": texto(fila, "registro_hex"),
        })

    return fecha, resultado


def consolidar():
    if not CARPETA_DATOS.is_dir():
        raise FileNotFoundError(
            f"Directory not found:\n{CARPETA_DATOS}"
        )

    registros = {}
    errores = []
    archivos_procesados = 0
    duplicados = 0

    # Busca también dentro de las carpetas historial_...
    archivos = sorted(CARPETA_DATOS.rglob("*.csv"))

    for ruta in archivos:
        tipo = identificar_archivo(ruta)

        # Excluye el archivo consolidado y otros CSV no reconocidos.
        if tipo is None:
            continue

        archivos_procesados += 1
        origen = str(ruta.relative_to(CARPETA_DATOS))

        with ruta.open(
            "r", newline="", encoding="utf-8-sig"
        ) as archivo:
            lector = csv.DictReader(archivo)

            for numero, fila in enumerate(lector, start=2):
                if not any(fila.values()):
                    continue

                try:
                    fecha, registro = normalizar(fila, tipo)

                except (ValueError, OverflowError, OSError) as error:
                    errores.append(
                        f"{origen}, fila {numero}: {error}"
                    )
                    continue

                # Elimina copias idénticas de un mismo registro.
                # Mantiene valores diferentes aunque tengan la misma fecha.
                clave = tuple(registro[columna] for columna in COLUMNAS)

                if clave in registros:
                    registros[clave]["origenes"].add(origen)
                    duplicados += 1
                else:
                    registros[clave] = {
                        "fecha": fecha,
                        "datos": registro,
                        "origenes": {origen},
                    }

    if errores:
        print("\nHay registros que necesitan revisión:")

        for error in errores[:10]:
            print(f"- {error}")

        raise ValueError(
            f"Found {len(errores)} errors. "
            "The consolidated history was not replaced."
        )

    if not registros:
        print("No se encontraron registros para consolidar.")
        return

    ordenados = sorted(
        registros.values(),
        key=lambda elemento: (
            elemento["fecha"],
            elemento["datos"]["direccion"],
            elemento["datos"]["tipo_registro"],
        ),
    )

    # Primero escribe un temporal y después reemplaza el consolidado.
    temporal = ARCHIVO_SALIDA.with_suffix(".tmp")

    with temporal.open(
        "w", newline="", encoding="utf-8-sig"
    ) as archivo:
        escritor = csv.DictWriter(
            archivo,
            fieldnames=COLUMNAS + ["archivos_origen"],
        )
        escritor.writeheader()

        for elemento in ordenados:
            escritor.writerow({
                **elemento["datos"],
                "archivos_origen": " | ".join(
                    sorted(elemento["origenes"])
                ),
            })

    temporal.replace(ARCHIVO_SALIDA)

    print("\nHistorial consolidado creado.")
    print(f"Archivos procesados: {archivos_procesados}")
    print(f"Registros conservados: {len(ordenados)}")
    print(f"Copias idénticas eliminadas: {duplicados}")
    print(f"\nUbicación:\n{ARCHIVO_SALIDA}")


if __name__ == "__main__":
    try:
        consolidar()
    except PermissionError:
        print(
            "Could not access a file. "
            "Close any CSV files open in Excel and try again."
        )
    except (OSError, ValueError, csv.Error) as error:
        print(f"\nError: {error}")