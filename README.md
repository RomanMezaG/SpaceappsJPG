# Ridge Support System

## Shared monitoring data

Summary, Model Input, Smart Watch, and Watch + XGBoost use one session-wide data
source. Watch values refresh in every tab and manual/CSV inputs persist when
switching views. The original sliders and default configuration are restored,
with defaults labeled and available live readings taking priority. Complete all 27 features or explicitly enable the saved
model imputer in the shared result panel. Imputation is off by default. See
`SHARED_HEALTH_DATA.md` for sources, freshness, and prediction behavior.

## Start with a session profile

After starting the three services, open the web app and select age (years),
height (cm), and weight (kg). Click **Continue to mood check-in**, answer all
16 EVEA questions, then click **Finish & connect watch**. The EVEA HMM tab
uses those same answers and records the completed assessment once. The watch
service waits until this final submission before scanning or calculating
indicators. Reloading the page resets the session and asks for both steps again.
See `EVEA_ONBOARDING.md` for the shared assessment state and
`PERFIL_Y_SESION.md` for calculation methods and session behavior.

## Run the app and model API

Install the JavaScript and Python dependencies:

```powershell
npm install
python -m pip install -r requirements.txt
```

Start the model API in one terminal:

```powershell
python -m uvicorn backend.main:app --reload
```

Start the React app in another terminal:

```powershell
npm run dev
```

The React app proxies `/api` requests to the Python API at `http://127.0.0.1:8000`.
The API loads `models/data_imputer.joblib` and `models/tuned_xgb_model.joblib` at startup.
XGBoost is pinned to 3.1.3 to load the supplied serialized model.
The EVEA Markov classifier loads its parameters from `models/modelo_evea.json` at build time.
XGBoost predictions display as normal below 1, warning from 1 through 1.5, and critical above 1.5.

## Smart-watch integration

Install the watch dependencies:

```powershell
python -m pip install -r watch/requirements.txt
```

In another terminal, start the watch service from the project root:

```powershell
python -m uvicorn servidor:app --app-dir watch --host 127.0.0.1 --port 8001
```

The watch service scans for the configured Mi Band and exposes its live status and history.
The app backend proxies that data at `/api/watch`. Set `WATCH_API_URL` if the watch service
uses a different address.
In the **Watch + XGBoost** pane, each new live BPM reading automatically fills the model's
heart-rate input and triggers a prediction using the current values of the other inputs.
