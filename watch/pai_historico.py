"""Reconstrucción por minuto a partir del historial observado consolidado."""

import csv
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import isfinite
from statistics import median


METODO_HISTORICO = "actividad_perfil_historico_v2"
COLUMNAS_HISTORICO = [
    "direccion", "minuto_utc", "fecha_inicio_utc", "fecha_fin_utc",
    "dia_local", "duracion_s", "cobertura_vivo_s", "puntos",
    "puntos_minuto", "pulso_bpm", "referencia_bpm", "pasos_minuto",
    "metodo", "archivo_origen",
]


def tasa_puntos(pulso, referencia, pasos, perfil):
    reserva = perfil.pulso_maximo_referencia - referencia
    if reserva <= 0:
        return 0.0
    aumento = max(0.0, (pulso - referencia) / reserva)
    if pasos < 5 or aumento < 0.20:
        return 0.0
    if aumento < 0.40:
        return 0.2
    if aumento < 0.60:
        return 0.5
    return 1.0


def fecha_utc(texto):
    fecha = datetime.fromisoformat(texto)
    if fecha.tzinfo is None:
        raise ValueError("Timestamp has no time zone")
    return fecha.astimezone(timezone.utc)


def numero(texto):
    try:
        valor = float(texto)
        return valor if isfinite(valor) else None
    except (TypeError, ValueError):
        return None


def cobertura_en_vivo(archivo, primero, limite):
    cobertura = defaultdict(list)
    if not archivo.exists():
        return cobertura
    with archivo.open("r", newline="", encoding="utf-8") as entrada:
        for fila in csv.DictReader(entrada):
            inicio = fecha_utc(fila["fecha_inicio_utc"])
            fin = fecha_utc(fila["fecha_fin_utc"])
            if fin <= inicio:
                raise ValueError("Invalid live interval")
            if fin > limite or fin.astimezone().date() < primero:
                continue
            while inicio < fin:
                minuto = inicio.replace(second=0, microsecond=0)
                corte = min(fin, minuto + timedelta(minutes=1))
                cobertura[minuto].append((inicio, corte))
                inicio = corte
    return cobertura


def segundos_cubiertos(intervalos):
    fin_anterior = None
    total = 0.0
    for inicio, fin in sorted(intervalos):
        if fin_anterior is None or inicio >= fin_anterior:
            total += (fin - inicio).total_seconds()
        elif fin > fin_anterior:
            total += (fin - fin_anterior).total_seconds()
        fin_anterior = fin if fin_anterior is None else max(fin_anterior, fin)
    return min(60.0, total)


def reconstruir(archivo, archivo_vivo, direccion, perfil):
    limite = datetime.now(timezone.utc)
    primero = limite.astimezone().date() - timedelta(days=6)
    grupos = {}
    filas_leidas = 0
    filas_invalidas = 0
    direccion = direccion.upper()
    with archivo.open("r", newline="", encoding="utf-8-sig") as entrada:
        lector = csv.DictReader(entrada)
        necesarias = {
            "fecha_utc", "direccion", "tipo_registro", "referencia_temporal",
            "pulso_bpm", "pasos_minuto",
        }
        if not necesarias.issubset(lector.fieldnames or []):
            raise ValueError("The original consolidated history must include timestamps, record types, and sources")
        for fila in lector:
            filas_leidas += 1
            if (fila.get("direccion") or "").upper() != direccion:
                continue
            tipo = fila.get("tipo_registro")
            if tipo not in ("actividad_minuto", "pulso_manual", "pulso_en_vivo"):
                continue
            origen = fila.get("referencia_temporal")
            if origen not in ("medicion_pulsera", "recepcion_PC"):
                continue
            try:
                fecha = fecha_utc(fila["fecha_utc"])
            except (ValueError, TypeError):
                filas_invalidas += 1
                continue
            minuto = fecha.replace(second=0, microsecond=0)
            if not primero <= minuto.astimezone().date() <= limite.astimezone().date():
                continue
            if minuto + timedelta(minutes=1) > limite:
                continue
            grupo = grupos.setdefault(minuto, {
                "pulsos": set(), "pasos": set(), "dormido": False,
            })
            pulso = numero(fila.get("pulso_bpm"))
            if pulso is not None and 30 <= pulso <= 220:
                grupo["pulsos"].add((fecha, pulso))
            if tipo == "actividad_minuto":
                pasos = numero(fila.get("pasos_minuto"))
                if pasos is not None and pasos >= 0 and pasos.is_integer():
                    grupo["pasos"].add(pasos)
                if (fila.get("registro_original_hex") or "").lower().startswith("78"):
                    grupo["dormido"] = True

    completos = {}
    reposo = defaultdict(list)
    for minuto, grupo in grupos.items():
        # No sumamos copias de la misma muestra ni resolvemos contradicciones inventando datos.
        if len(grupo["pasos"]) != 1 or not grupo["pulsos"]:
            continue
        pulso = float(median(valor for _, valor in grupo["pulsos"]))
        pasos = next(iter(grupo["pasos"]))
        dia = minuto.astimezone().date()
        completos[minuto] = (dia, pulso, pasos)
        if pasos <= 5 and not grupo["dormido"]:
            reposo[dia].append(pulso)

    if not completos:
        raise ValueError("No minutes with observed BPM and steps were found in the last seven days")
    referencias = {
        dia: float(median(valores)) for dia, valores in reposo.items()
        if len(valores) >= 30
    }
    if not referencias:
        raise ValueError("At least 30 valid low-activity minutes are required for a daily baseline")

    cobertura = cobertura_en_vivo(archivo_vivo, primero, limite)
    filas = []
    sin_referencia = 0
    for minuto, (dia, pulso, pasos) in sorted(completos.items()):
        referencia = referencias.get(dia)
        if referencia is None:
            sin_referencia += 1
            continue
        cubierto = segundos_cubiertos(cobertura.get(minuto, []))
        segundos = max(0.0, 60.0 - cubierto)
        if segundos <= 0:
            continue
        tasa = tasa_puntos(pulso, referencia, pasos, perfil)
        filas.append({
            "direccion": direccion,
            "minuto_utc": minuto.isoformat(),
            "fecha_inicio_utc": minuto.isoformat(),
            "fecha_fin_utc": (minuto + timedelta(minutes=1)).isoformat(),
            "dia_local": dia.isoformat(),
            "duracion_s": segundos,
            "cobertura_vivo_s": cubierto,
            "puntos": tasa * segundos / 60.0,
            "puntos_minuto": tasa,
            "pulso_bpm": pulso,
            "referencia_bpm": referencia,
            "pasos_minuto": pasos,
            "metodo": METODO_HISTORICO,
            "archivo_origen": archivo.name,
        })
    informe = {
        "estado": "importado",
        "fecha_importacion_utc": limite.isoformat(),
        "archivo_origen": str(archivo),
        "direccion": direccion,
        "metodo": METODO_HISTORICO,
        "perfil_id": perfil.identificador,
        "filas_leidas": filas_leidas,
        "fechas_invalidas": filas_invalidas,
        "minutos_completos": len(completos),
        "minutos_importados": len(filas),
        "minutos_sin_referencia": sin_referencia,
        "referencias_bpm_por_dia": {dia.isoformat(): valor for dia, valor in referencias.items()},
    }
    return filas, informe
