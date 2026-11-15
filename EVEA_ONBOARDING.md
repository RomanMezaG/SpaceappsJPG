# EVEA onboarding and session follow-up

The entry flow is now Profile → EVEA mood check-in (16 items, 0–10) → watch
connection and dashboard. The first profile button advances to the check-in;
the watch session is requested only after all 16 answers are explicitly provided.
Zero is a valid answer. No initial answers are filled automatically.

The questionnaire uses the same item order and English labels as the existing
EVEA HMM tab, shared in src/eveaItems.js. Back navigation preserves the current
profile and answers. If connection fails, answers remain available for retry.

SessionGate owns the answers and saved sequence. The initial completed check-in
is recorded once when the watch session is accepted. The EVEA tab reads those
same answers through session context and applies the existing modelo_evea.json
parameters with the existing HMM implementation. It does not restore the previous
hardcoded answer set. The simulation-origin model file is unchanged.

Editing a slider in the EVEA tab creates a preview of a new assessment after the
saved sequence. Save assessment commits it once; pressing Save again is disabled
until an answer is edited. Evaluation does not append a second copy of the saved
current assessment. Reset sequence clears saved assessments but retains the
current answers. No change maps EVEA mood scores to the XGBoost stress input.

This follow-up sequence is held in memory for the current browser session, up to
15 saved assessments. No longitudinal database persistence was added. Reloading
the page or expiration of the watch session clears the entry flow and asks for a
new profile and check-in, consistent with the current session design.

All interface text is English. Files were reviewed by reading; no tests, models,
Bluetooth connections, or browser sessions were executed automatically.
