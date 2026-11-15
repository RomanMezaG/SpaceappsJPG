# Heart-rate history in Summary

Summary includes a heart-rate-only trend for today and the previous six local
calendar days (watch-service computer time). It reads the existing
`watch/datos/historial_completo.csv`, not the latest-120-row session table.
Only the configured watch address and original activity/minute, manual-pulse,
and live-pulse record types are included. Other model inputs, profile estimates,
and imported dashboard defaults are not used for this chart.

Exact timestamp/BPM duplicates are counted once. Missing BPM, non-finite values,
0, 255, timestamps without time zones, and future readings are excluded. Each
observed minute has equal weight in the hourly and weekly averages. Hours with
no measurements remain null; the chart breaks the line rather than interpolating.
These are observed-data averages, not a continuous full-week measurement.

The existing consolidated history updates approximately every 30 seconds during
the watch session. The chart requests `/api/watch/heart-rate-trend` every
30 seconds while Summary is open. The model API forwards the current session
header to `/api/pulso/tendencia` on the watch service. CSV reading runs in a
worker thread without rewriting source files or communicating with Bluetooth.
Errors show an English message and retain a previous successfully loaded chart,
with its original update time. Switching away from Summary cancels chart polling.

Hourly points can be focused or hovered for details. An expandable table exposes
the same averages and coverage. Readings are attributed to the configured watch;
the historical file does not prove which person wore it on each date.

No new dependencies or model-input changes. Restart both Python services to load
the new endpoint, then reload the frontend. Changes were reviewed statically;
no tests, services, inference, or Bluetooth sessions were run automatically.
