import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.error import URLError
from urllib.request import urlopen

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
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
    model_config = ConfigDict(extra="forbid")

    mission_day: float
    heart_rate_bpm: float
    systolic_bp_mmhg: float
    diastolic_bp_mmhg: float
    blood_glucose_mg_dl: float
    oxygen_saturation_pct: float
    ambient_radiation_msv_day: float
    radiation_dose_interval_msv: float
    radiation_cumulative_msv: float
    body_temperature_c: float
    sleep_duration_hours: float
    urine_ph: float
    urine_specific_gravity: float
    intraocular_pressure_mmhg: float
    muscle_mass_kg: float
    baseline_muscle_mass_kg: float
    muscular_atrophy_pct: float
    exercise_duration_min_day: float
    water_intake_l_day: float
    calorie_intake_kcal_day: float
    stress_level_1_10: float
    mission_phase_Late: Literal[0, 1]
    mission_phase_Middle: Literal[0, 1]
    urine_protein_Positive: Literal[0, 1]
    urine_protein_Trace: Literal[0, 1]
    urine_glucose_Positive: Literal[0, 1]
    urine_glucose_Trace: Literal[0, 1]


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


app = FastAPI(title="AstroHealth XGBoost API", lifespan=lifespan)


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


@app.get("/api/watch")
def watch_data():
    try:
        with urlopen(WATCH_API_URL, timeout=3) as response:
            return json.loads(response.read())
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=503,
            detail=f"Smart watch service unavailable: {error}",
        ) from error


@app.post("/api/predict")
def predict(payload: ModelInput, request: Request):
    values = payload.model_dump()
    frame = pd.DataFrame(
        [[values[column] for column in FEATURE_COLUMNS]],
        columns=FEATURE_COLUMNS,
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
    }
