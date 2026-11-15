"""Read-only seven-day heart-rate trend from original watch observations."""

import csv
import math
from collections import defaultdict
from datetime import datetime, time, timedelta, timezone


def leer_tendencia(archivo, direccion):
    fin = datetime.now(timezone.utc)
    primer_dia = fin.astimezone().date() - timedelta(days=6)
    inicio = datetime.combine(primer_dia, time.min).astimezone(timezone.utc)
    minutos = defaultdict(dict)
    descartadas = 0
    with archivo.open("r", newline="", encoding="utf-8-sig") as entrada:
        lector = csv.DictReader(entrada)
        if not {"fecha_utc", "direccion", "tipo_registro", "pulso_bpm"}.issubset(lector.fieldnames or []):
            raise ValueError("Heart-rate history columns are unavailable.")
        for fila in lector:
            if (fila.get("direccion") or "").upper() != direccion.upper():
                continue
            if fila.get("tipo_registro") not in ("actividad_minuto", "pulso_manual", "pulso_en_vivo"):
                continue
            texto = (fila.get("pulso_bpm") or "").strip()
            if not texto:
                continue
            try:
                fecha = datetime.fromisoformat(fila["fecha_utc"].replace("Z", "+00:00"))
                pulso = float(texto)
                # 0/255 are unavailable-value markers in the observed watch records.
                if fecha.tzinfo is None or not math.isfinite(pulso) or not 0 < pulso < 255:
                    raise ValueError("Invalid observation")
                fecha = fecha.astimezone(timezone.utc)
            except (ValueError, TypeError, OverflowError):
                descartadas += 1
                continue
            if inicio <= fecha <= fin:
                minuto = fecha.replace(second=0, microsecond=0)
                # Repeated imports of the same timestamp/value must not add weight.
                minutos[minuto][(fecha, pulso)] = pulso

    horas = defaultdict(list)
    for minuto, lecturas in minutos.items():
        promedio = sum(lecturas.values()) / len(lecturas)
        horas[minuto.replace(minute=0)].append(promedio)

    puntos = []
    hora = inicio.replace(minute=0, second=0, microsecond=0)
    while hora <= fin:
        valores = horas.get(hora, [])
        puntos.append({
            "timestamp": hora.isoformat(),
            "bpm": round(sum(valores) / len(valores), 1) if valores else None,
            "minutes_recorded": len(valores),
        })
        hora += timedelta(hours=1)

    promedios = [sum(lecturas.values()) / len(lecturas) for lecturas in minutos.values()]
    return {
        "start_utc": inicio.isoformat(), "end_utc": fin.isoformat(),
        "points": puntos,
        "average_bpm": round(sum(promedios) / len(promedios), 1) if promedios else None,
        "minutes_recorded": len(minutos),
        "readings": sum(len(lecturas) for lecturas in minutos.values()),
        "days_recorded": len({minuto.astimezone().date() for minuto in minutos}),
        "discarded_rows": descartadas,
        "source": archivo.name,
    }
