import csv
import json
import math
import random
from bisect import bisect_right
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from itertools import accumulate
from pathlib import Path
from statistics import median


CARPETA = Path(__file__).resolve().parent / "datos"
ENTRADA = CARPETA / "historial_completo.csv"
SALIDA = CARPETA / "historial_completo_rellenado.csv"
PROCEDENCIA = CARPETA / "procedencia_relleno.json"

ZONA = timezone(timedelta(hours=-8))
SEMILLA = 42

PESO_KG = 78.0
ESTATURA_M = 1.81

# Aproximación inicial; no es una medición de tu paso.
LONGITUD_PASO_M = 0.75

KCAL_POR_PASO = (
    0.5 * PESO_KG * LONGITUD_PASO_M / 1000
)

CAMPOS = [
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


def vacio(valor):
    return valor is None or not str(valor).strip()


def numero(valor):
    if vacio(valor):
        return None

    resultado = float(valor)

    if not math.isfinite(resultado):
        raise ValueError("Se encontró un número no finito.")

    return resultado


def fecha_de(fila):
    fecha = datetime.fromisoformat(
        fila["fecha_utc"].strip().replace("Z", "+00:00")
    )

    if fecha.tzinfo is None:
        raise ValueError("Una fecha no contiene zona horaria.")

    return fecha


def minuto_del_dia(fecha):
    local = fecha.astimezone(ZONA)
    return local.hour * 60 + local.minute


def categoria_estres(valor):
    if valor < 40:
        return "relajado"
    if valor < 60:
        return "leve"
    if valor < 80:
        return "moderado"
    return "alto"


def crear_curva(puntos, factor=1.0):
    """
    Curva creciente que pasa por los puntos disponibles.
    Si no hay puntos, utiliza el factor indicado.
    """
    if not puntos:
        return lambda x: max(0.0, x * factor)

    valores = {0.0: 0.0}
    observados = {}

    for x, y in puntos:
        x, y = float(x), float(y)

        if x in observados and abs(observados[x] - y) > 0.00001:
            raise ValueError(
                "Hay acumulados incompatibles para el mismo punto. "
                "Revisar los registros originales."
            )

        observados[x] = y
        valores[x] = y

    pares = sorted(valores.items())

    if any(
        pares[i][1] < pares[i - 1][1] - 0.00001
        for i in range(1, len(pares))
    ):
        raise ValueError(
            "Un acumulado disminuye dentro del mismo día. "
            "Se conservará el original sin generar la copia."
        )

    xs = [x for x, _y in pares]
    ys = [y for _x, y in pares]

    def calcular(x):
        if len(xs) == 1:
            return max(0.0, ys[0] + (x - xs[0]) * factor)

        posicion = bisect_right(xs, x)

        if posicion == 0:
            izquierda, derecha = 0, 1
        elif posicion >= len(xs):
            izquierda, derecha = len(xs) - 2, len(xs) - 1
        else:
            izquierda, derecha = posicion - 1, posicion

        distancia = xs[derecha] - xs[izquierda]

        if distancia == 0:
            return max(0.0, ys[izquierda])

        proporcion = (x - xs[izquierda]) / distancia

        return max(
            0.0,
            ys[izquierda]
            + proporcion * (ys[derecha] - ys[izquierda]),
        )

    return calcular


def rellenar():
    azar = random.Random(SEMILLA)

    with ENTRADA.open(
        "r", newline="", encoding="utf-8-sig"
    ) as archivo:
        lector = csv.DictReader(archivo)
        columnas = list(lector.fieldnames or [])
        filas = list(lector)

    faltan = set(CAMPOS + ["fecha_utc"]) - set(columnas)

    if faltan:
        raise ValueError(f"Faltan columnas: {sorted(faltan)}")

    if not filas:
        raise ValueError("El CSV está vacío.")

    grupos = defaultdict(list)

    for indice, fila in enumerate(filas):
        fecha = fecha_de(fila)
        dispositivo = fila.get("direccion", "")
        dia = fecha.astimezone(ZONA).date()
        grupos[(dispositivo, dia)].append((indice, fecha, fila))

    completadas = defaultdict(list)
    historial_pai = defaultdict(list)

    for (dispositivo, dia), registros in sorted(grupos.items()):
        registros.sort(key=lambda elemento: elemento[1])

        pasos_conocidos = {}
        pulsos_conocidos = []

        for _indice, fecha, fila in registros:
            minuto = minuto_del_dia(fecha)
            pasos = numero(fila["pasos_minuto"])
            pulso = numero(fila["pulso_bpm"])

            if pasos is not None:
                # Evita sumar dos veces registros del mismo minuto.
                pasos_conocidos[minuto] = max(
                    pasos_conocidos.get(minuto, 0),
                    round(pasos),
                )

            if pulso is not None:
                pulsos_conocidos.append(
                    (fecha.timestamp(), pulso)
                )

        pulsos_conocidos.sort()

        tiempos_pulso = [t for t, _v in pulsos_conocidos]
        valores_pulso = [v for _t, v in pulsos_conocidos]

        if valores_pulso:
            ordenados = sorted(valores_pulso)
            tramo = ordenados[:max(1, len(ordenados) // 3)]
            base_pulso = median(tramo)
        else:
            base_pulso = 70.0

        pasos_perfil = []

        for minuto in range(1440):
            hora = minuto // 60

            if minuto in pasos_conocidos:
                pasos = pasos_conocidos[minuto]
            elif hora < 7 or hora >= 23:
                pasos = 0
            elif azar.random() < 0.08:
                pasos = azar.randint(30, 70)
            else:
                pasos = azar.randint(0, 3)

            pasos_perfil.append(pasos)

        pasos_base = list(accumulate(pasos_perfil))
        pulso_perfil = []
        estres_perfil = []
        peso_pai = []

        comienzo = datetime.combine(
            dia, datetime.min.time(), tzinfo=ZONA
        )

        estres_anterior = 25.0
        pai_acumulado = 0.0

        for minuto in range(1440):
            hora = minuto // 60
            pasos = pasos_perfil[minuto]
            instante = (
                comienzo + timedelta(minutes=minuto)
            ).timestamp()

            dormido = hora < 7 or hora >= 23

            objetivo_pulso = (
                base_pulso - 10
                if dormido
                else base_pulso + min(65, pasos * 0.55)
            )

            posicion = bisect_right(tiempos_pulso, instante)

            if (
                0 < posicion < len(tiempos_pulso)
                and tiempos_pulso[posicion]
                - tiempos_pulso[posicion - 1] <= 30 * 60
            ):
                t0 = tiempos_pulso[posicion - 1]
                t1 = tiempos_pulso[posicion]
                v0 = valores_pulso[posicion - 1]
                v1 = valores_pulso[posicion]

                if t1 > t0:
                    proporcion = (instante - t0) / (t1 - t0)
                    objetivo_pulso = v0 + proporcion * (v1 - v0)

            else:
                candidatos = []

                if posicion > 0:
                    candidatos.append(posicion - 1)

                if posicion < len(tiempos_pulso):
                    candidatos.append(posicion)

                if candidatos:
                    cercano = min(
                        candidatos,
                        key=lambda i: abs(tiempos_pulso[i] - instante),
                    )

                    if abs(tiempos_pulso[cercano] - instante) <= 5 * 60:
                        objetivo_pulso = valores_pulso[cercano]

            pulso = max(
                40,
                min(180, objetivo_pulso + azar.gauss(0, 1.5)),
            )
            pulso_perfil.append(pulso)

            # Perfil aproximado de estrés.
            # No identifica la causa del pulso ni un diagnóstico.
            if dormido:
                objetivo_estres = 15
            elif 9 <= hora < 17:
                objetivo_estres = 38
            else:
                objetivo_estres = 25

            if pasos < 15:
                objetivo_estres += max(
                    0, pulso - base_pulso
                ) * 0.35

            estres_anterior += (
                0.10 * (objetivo_estres - estres_anterior)
                + azar.gauss(0, 1.5)
            )

            estres_perfil.append(
                max(3, min(95, estres_anterior))
            )

            # Regla propia de generación para PAI.
            aporte = (
                max(0, pulso - 95) * 0.002
                if pasos > 15
                else 0.00001
            )
            pai_acumulado += aporte
            peso_pai.append(pai_acumulado)

        puntos_pasos = []
        puntos_pai = []

        for _indice, fecha, fila in registros:
            minuto = minuto_del_dia(fecha)

            valor = numero(fila["pasos_acumulados"])
            if valor is not None:
                puntos_pasos.append((pasos_base[minuto], valor))

            valor = numero(fila["pai_hoy"])
            if valor is not None:
                puntos_pai.append((peso_pai[minuto], valor))

        curva_pasos = crear_curva(puntos_pasos)
        curva_pai = crear_curva(puntos_pai)

        acumulados = [
            round(curva_pasos(valor))
            for valor in pasos_base
        ]
        pai_dia = [
            curva_pai(valor)
            for valor in peso_pai
        ]

        puntos_distancia = []
        puntos_calorias = []
        bases_pai = []

        for _indice, fecha, fila in registros:
            minuto = minuto_del_dia(fecha)

            pasos = numero(fila["pasos_acumulados"])
            if pasos is None:
                pasos = acumulados[minuto]

            distancia = numero(fila["distancia_estimada_m"])
            calorias = numero(
                fila["calorias_estimadas_acumuladas_kcal"]
            )

            if distancia is not None:
                puntos_distancia.append((pasos, distancia))

            if calorias is not None:
                puntos_calorias.append((pasos, calorias))

            total = numero(fila["pai_total"])
            hoy = numero(fila["pai_hoy"])

            if total is not None:
                if hoy is None:
                    hoy = pai_dia[minuto]
                bases_pai.append(max(0.0, total - hoy))

        curva_distancia = crear_curva(
            puntos_distancia,
            factor=LONGITUD_PASO_M,
        )

        curva_calorias = crear_curva(
            puntos_calorias,
            factor=KCAL_POR_PASO,
        )

        if bases_pai:
            base_total_pai = median(bases_pai)
        else:
            base_total_pai = sum(
                valor
                for fecha_anterior, valor in historial_pai[dispositivo]
                if 1 <= (dia - fecha_anterior).days <= 6
            )

        for indice, fecha, fila in registros:
            minuto = minuto_del_dia(fecha)

            candidatos = {
                "pulso_bpm": pulso_perfil[minuto],
                "pasos_minuto": pasos_perfil[minuto],
                "pasos_acumulados": acumulados[minuto],
                "distancia_estimada_m": curva_distancia(
                    acumulados[minuto]
                ),
                "calorias_estimadas_acumuladas_kcal": curva_calorias(
                    acumulados[minuto]
                ),
                "pai_hoy": pai_dia[minuto],
                "pai_total": base_total_pai + pai_dia[minuto],
                "estres": estres_perfil[minuto],
            }

            for campo, valor in candidatos.items():
                if vacio(fila.get(campo)):
                    if campo in ENTEROS:
                        fila[campo] = str(round(valor))
                    else:
                        fila[campo] = (
                            f"{valor:.6f}".rstrip("0").rstrip(".")
                        )

                    completadas[indice].append(campo)

            if (
                "categoria_estres" in columnas
                and vacio(fila.get("categoria_estres"))
            ):
                fila["categoria_estres"] = categoria_estres(
                    float(fila["estres"])
                )
                completadas[indice].append("categoria_estres")

            # Los metadatos ausentes se identifican como no disponibles.
            # No se generan paquetes Bluetooth ni direcciones.
            for columna in columnas:
                if vacio(fila.get(columna)):
                    fila[columna] = "NO_DISPONIBLE"
                    completadas[indice].append(columna)

        historial_pai[dispositivo].append(
            (dia, pai_dia[-1])
        )

    # Conserva el orden y las columnas del CSV original.
    with SALIDA.open(
        "w", newline="", encoding="utf-8-sig"
    ) as archivo:
        escritor = csv.DictWriter(archivo, fieldnames=columnas)
        escritor.writeheader()
        escritor.writerows(filas)

    # La procedencia queda fuera de la tabla usada por el modelo.
    PROCEDENCIA.write_text(
        json.dumps({
            "archivo_original": ENTRADA.name,
            "archivo_resultado": SALIDA.name,
            "semilla": SEMILLA,
            "metodo": (
                "Relleno condicional con perfiles por minuto, "
                "interpolación de pulso y curvas de acumulados "
                "ancladas en los valores existentes."
            ),
            "estres": "Generado; no había mediciones en la entrada.",
            "pai": "Aproximación; no reproduce el algoritmo de Xiaomi.",
            "celdas_completadas": [
                {
                    "fila_csv": indice + 2,
                    "columnas": campos,
                }
                for indice, campos in sorted(completadas.items())
            ],
        }, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Filas conservadas: {len(filas)}")
    print(f"Celdas completadas: {sum(map(len, completadas.values()))}")
    print(f"\nCSV:\n{SALIDA}")
    print(f"\nMétodo y procedencia:\n{PROCEDENCIA}")


if __name__ == "__main__":
    try:
        rellenar()
    except (OSError, ValueError, csv.Error) as error:
        print(f"\nError: {error}")