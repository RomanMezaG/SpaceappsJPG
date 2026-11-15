# Shared health data and model inputs

## Current configuration: restored sliders and defaults

The original INITIAL_MODEL_INPUTS values and range sliders have been restored at
the user's request. Session state starts from those settings, with source Default.
Watch/Calculated readings take priority when available; Manual and CSV values
override defaults. All tabs still use the same provider. Reset inputs restores
the original configuration without replacing currently available live readings.
CSV imports apply present numeric features over defaults; absent CSV fields use
defaults. Defaults are configured scenario inputs, not measurements.

Sliders use the original ranges and steps. A current value outside its original
range expands that range rather than changing/clamping the data. Fields actively
supplied by the watch/calculation are disabled for manual slider edits. Category
sliders restore the previous Early/Negative choices through the default encoding.
The shared result captures the source kinds used for each prediction and reports
the number of defaults. A complete default configuration can predict immediately;
imputation is still optional if a field is explicitly missing. All UI text is English.

The missing-by-default behavior documented below describes the earlier revision;
the shared-state architecture, explicit imputation, and freshness rules remain.

Summary, Model Input, Smart Watch, and Watch + XGBoost now consume the same
HealthDataProvider, mounted for the entire active profile session. Switching tabs
does not restart polling, reset manually entered values, or create a second copy
of the model state. User-facing text is English.

## Sources and freshness

The provider polls /api/watch sequentially approximately every 2 seconds after
the previous request completes, with a 5-second request timeout. It discards
updates from unmounted/session-replaced instances. There is only one polling loop.
Manual refresh uses the same loop and does not create concurrent watch requests.

Fresh watch BPM overrides manual/CSV BPM. Available calculated stress overrides
manual/CSV stress. When live readings disappear those fields revert to an explicitly
supplied manual/CSV value if one exists; otherwise they are null. Every model
field has a source (Watch, Calculated, Manual, CSV) and timestamp, or no source.
Step summaries, profile distance, and walking energy are shown only while connected
and no more than 45 seconds old. PAI can still show accumulated historical points.
The history table remains a record of earlier readings, not the current values.

All 27 model features initially contain null. Numeric zero is a supplied value,
not an empty field. Unknown categories are null, not automatically Negative/Early.
Manual/CSV values persist only for the current browser session. Live numbers are
not clamped to the old slider limits; available values appear identically in the
shared views. Number formatting can differ by card precision.

## Model behavior

The existing trained model still expects all 27 ordered features. The API accepts
missing fields as null and rejects NaN/Infinity. With imputation disabled (default),
prediction waits until every input is supplied. Users may explicitly enable the
saved model imputer to complete missing inputs internally for an experimental
prediction. No imputed value is written back into the displayed measurements.
The result reports supplied and imputed feature names and the exact nullable
input values submitted. Category flags must be supplied together and cannot both
be positive. A request with zero supplied features is rejected.

Model prediction is shared and debounced by 350 ms. New input snapshots invalidate
and cancel earlier requests; obsolete responses cannot replace the latest result.
Each result can be expanded to inspect the inputs actually used for that result.
Incomplete-input predictions may rely mostly on population imputation and do not
validate clinical accuracy or equivalence of the custom stress index to training.

PAI, steps, profile height/weight, distance, and walking energy are not additional
inputs to this model. In particular, burned calories must not be substituted for
calorie_intake_kcal_day, steps for exercise duration, or the custom stress index
for an EVEA mood assessment. Demographic fields are still used by the separate
watch estimation algorithms, not appended to the trained model's feature list.

## Summary and CSV

The Summary tab now shows shared supplied values and missing states, rather than
INITIAL_METRICS demonstration values. The global synthetic “all 13 normal” health
score has been removed. The separate MARES demonstration remains labeled as such.
EVEA remains its own questionnaire/model, not a source of XGBoost stress values.

CSV row selection updates the same shared model input store using exact feature
names and a restricted alias list. Only numeric values actually present are
imported; missing cells clear old CSV/manual values. Live available fields retain
priority and their source. A generic stress column is not assumed to have a 1–10
scale. The last CSV column is no longer automatically treated as a classification.

## Validation

Changes were reviewed by reading the source. No tests, model inference, Bluetooth
connections, or browser sessions were executed automatically, per user preference.
