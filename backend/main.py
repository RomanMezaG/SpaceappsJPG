import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request as URLRequest, urlopen

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
WATCH_API_URL = os.getenv(
    "WATCH_API_URL",
    "http://127.0.0.1:8001/api/datos",
)
FEATURE_COLUMNS = (
    "mission_day",
    "heart_rate_bpm",
    "systolic_bp_mmhg",
    "diastolic_bp_mmhg",
    "blood_glucose_mg_dl",
    "oxygen_saturation_pct",
    "ambient_radiation_msv_day",
    "radiation_dose_interval_msv",
    "radiation_cumulative_msv",
    "body_temperature_c",
    "sleep_duration_hours",
    "urine_ph",
    "urine_specific_gravity",
    "intraocular_pressure_mmhg",
    "muscle_mass_kg",
    "baseline_muscle_mass_kg",
    "muscular_atrophy_pct",
    "exercise_duration_min_day",
    "water_intake_l_day",
    "calorie_intake_kcal_day",
    "stress_level_1_10",
    "mission_phase_Late",
    "mission_phase_Middle",
    "urine_protein_Positive",
    "urine_protein_Trace",
    "urine_glucose_Positive",
    "urine_glucose_Trace",
)


class ModelInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    mission_day: float | None = None
    heart_rate_bpm: float | None = None
    systolic_bp_mmhg: float | None = None
    diastolic_bp_mmhg: float | None = None
    blood_glucose_mg_dl: float | None = None
    oxygen_saturation_pct: float | None = None
    ambient_radiation_msv_day: float | None = None
    radiation_dose_interval_msv: float | None = None
    radiation_cumulative_msv: float | None = None
    body_temperature_c: float | None = None
    sleep_duration_hours: float | None = None
    urine_ph: float | None = None
    urine_specific_gravity: float | None = None
    intraocular_pressure_mmhg: float | None = None
    muscle_mass_kg: float | None = None
    baseline_muscle_mass_kg: float | None = None
    muscular_atrophy_pct: float | None = None
    exercise_duration_min_day: float | None = None
    water_intake_l_day: float | None = None
    calorie_intake_kcal_day: float | None = None
    stress_level_1_10: float | None = None
    mission_phase_Late: Literal[0, 1] | None = None
    mission_phase_Middle: Literal[0, 1] | None = None
    urine_protein_Positive: Literal[0, 1] | None = None
    urine_protein_Trace: Literal[0, 1] | None = None
    urine_glucose_Positive: Literal[0, 1] | None = None
    urine_glucose_Trace: Literal[0, 1] | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    imputer = joblib.load(MODEL_DIR / "data_imputer.joblib")
    if not hasattr(imputer, "_fill_dtype"):
        if imputer.strategy != "mean" or not hasattr(imputer, "_fit_dtype"):
            raise RuntimeError("The saved imputer is not compatible with this scikit-learn version.")
        imputer._fill_dtype = imputer._fit_dtype

    imputer_features = tuple(getattr(imputer, "feature_names_in_", ()))
    if imputer_features and imputer_features != FEATURE_COLUMNS:
        raise RuntimeError("The imputer feature order does not match the model input schema.")

    model = joblib.load(MODEL_DIR / "tuned_xgb_model.joblib")
    if getattr(model, "n_features_in_", len(FEATURE_COLUMNS)) != len(FEATURE_COLUMNS):
        raise RuntimeError("The XGBoost model does not expect 27 input features.")

    model_features = tuple(getattr(model, "feature_names_in_", ()))
    if model_features and model_features != FEATURE_COLUMNS:
        raise RuntimeError("The XGBoost model feature order does not match the input schema.")

    app.state.imputer = imputer
    app.state.model = model
    yield


app = FastAPI(title="Ridge Support System API", lifespan=lifespan)


def json_scalar(value):
    return value.item() if hasattr(value, "item") else value


@app.get("/api/health")
def health(request: Request):
    return {
        "status": "ready",
        "feature_count": len(FEATURE_COLUMNS),
        "models_loaded": hasattr(request.app.state, "model")
        and hasattr(request.app.state, "imputer"),
    }


def consultar_reloj(url, datos=None, headers=None, timeout=5, crudo=False):
    try:
        peticion = URLRequest(
            url,
            data=json.dumps(datos).encode("utf-8") if datos is not None else None,
            headers={"Content-Type": "application/json", **(headers or {})},
        )
        with urlopen(peticion, timeout=timeout) as response:
            contenido = response.read()
            return contenido if crudo else json.loads(contenido)
    except HTTPError as error:
        try:
            detalle = json.loads(error.read()).get("detail", "Watch service error")
        except (ValueError, AttributeError):
            detalle = "Watch service error"
        raise HTTPException(status_code=error.code, detail=detalle) from error
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=503,
            detail=f"Smart watch service unavailable: {error}",
        ) from error


@app.get("/api/watch")
def watch_data(request: Request):
    return consultar_reloj(WATCH_API_URL, headers={
        "X-Watch-Session": request.headers.get("X-Watch-Session", ""),
    })


@app.get("/api/watch/heart-rate-trend")
def tendencia_pulso_reloj(request: Request):
    return consultar_reloj(
        WATCH_API_URL.rsplit("/", 1)[0] + "/pulso/tendencia",
        headers={"X-Watch-Session": request.headers.get("X-Watch-Session", "")},
        timeout=10,
    )


@app.post("/api/watch/session")
def iniciar_sesion_reloj(payload: dict):
    return consultar_reloj(WATCH_API_URL.rsplit("/", 1)[0] + "/sesion", payload, timeout=30)


@app.get("/api/watch/history.csv")
def descargar_historial_reloj(request: Request):
    contenido = consultar_reloj(
        WATCH_API_URL.rsplit("/", 1)[0] + "/historial.csv",
        headers={"X-Watch-Session": request.headers.get("X-Watch-Session", "")},
        crudo=True,
    )
    return Response(content=contenido, media_type="text/csv", headers={
        "Content-Disposition": 'attachment; filename="historial_sesion.csv"',
    })


@app.post("/api/watch/session/reset")
def reiniciar_sesion_reloj():
    return consultar_reloj(WATCH_API_URL.rsplit("/", 1)[0] + "/sesion/reiniciar", {}, timeout=10)


@app.post("/api/watch/session/ping")
def mantener_sesion_reloj(payload: dict):
    return consultar_reloj(WATCH_API_URL.rsplit("/", 1)[0] + "/sesion/ping", payload)


@app.post("/api/watch/session/close")
def cerrar_sesion_reloj(payload: dict):
    return consultar_reloj(WATCH_API_URL.rsplit("/", 1)[0] + "/sesion/cerrar", payload, timeout=10)


@app.post("/api/predict")
def predict(payload: ModelInput, request: Request, allow_imputation: bool = False, snapshot_id: str | None = None):
    values = payload.model_dump()
    provided = [column for column in FEATURE_COLUMNS if values[column] is not None]
    missing = [column for column in FEATURE_COLUMNS if values[column] is None]
    if not provided:
        raise HTTPException(status_code=422, detail="Provide at least one model input.")
    if missing and not allow_imputation:
        raise HTTPException(status_code=422, detail={
            "message": "Complete the missing inputs or explicitly enable model imputation.",
            "missing_features": missing,
        })
    for left, right in (
        ("mission_phase_Late", "mission_phase_Middle"),
        ("urine_protein_Positive", "urine_protein_Trace"),
        ("urine_glucose_Positive", "urine_glucose_Trace"),
    ):
        a, b = values[left], values[right]
        if (a is None) != (b is None) or (a is not None and a + b > 1):
            raise HTTPException(status_code=422, detail=f"Supply a consistent category for {left} and {right}.")
    frame = pd.DataFrame(
        [[values[column] for column in FEATURE_COLUMNS]],
        columns=FEATURE_COLUMNS,
        dtype=float,
    )
    transformed = request.app.state.imputer.transform(frame)
    model = request.app.state.model
    prediction = json_scalar(model.predict(transformed)[0])

    probabilities = None
    if hasattr(model, "predict_proba"):
        raw_probabilities = model.predict_proba(transformed)[0]
        classes = getattr(model, "classes_", range(len(raw_probabilities)))
        probabilities = {
            str(json_scalar(label)): float(probability)
            for label, probability in zip(classes, raw_probabilities)
        }

    return {
        "prediction": prediction,
        "probabilities": probabilities,
        "feature_order": list(FEATURE_COLUMNS),
        "provided_features": provided,
        "imputed_features": missing,
        "input_values": values,
        "snapshot_id": snapshot_id,
        "imputation_used": bool(missing),
    }
