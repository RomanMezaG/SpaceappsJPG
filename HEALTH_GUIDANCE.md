# Shared status and recommendations

Summary again displays a status banner, system groups and recommended-action
checklists. Heart rate, systolic/diastolic pressure, glucose, oxygen saturation,
temperature and sleep cards open an accessible native dialog with current value,
source, configured band, recommendations and spaceflight context. Escape and the
close button dismiss the dialog. The shared XGBoost result also includes actions
in Model Input / Watch + XGBoost. Summary suppresses that duplicate action list.

All assessments use HealthDataContext inputs and the current prediction snapshot.
The overall banner takes the greater severity of available parameter rules and
the current model classification. Missing values are pending. Pending or failed
model requests are explicitly labeled, while parameter checks remain available.
No health percentage is inferred from the number of normal parameters.

Rules are centralized in src/guidanceRules.js. Original display bands for pulse,
glucose, systolic pressure, oxygen saturation, temperature, sleep and urine
specific gravity are retained. Added diastolic display bands: 60–80, with
critical flags below 50 or above 100 mmHg. Ambient radiation flags elevation
above 1 (warning) or 2.5 (critical) mSv/day; low nonnegative radiation is not an
alert. These are project UI bands, not validated clinical or mission thresholds.
In particular the retained glucose high boundary of 140 is not a universal
emergency threshold. Defaults remain explicitly labeled as configuration values.

Recommendations are rule-based review prompts, not model feature attribution or
prescriptions. High/low glucose have different actions. Pressure guidance checks
measurement technique. No medication dose changes or fixed fluid prescriptions
are generated. Reference links for AHA measurement guidance, NIDDK hypoglycemia
and NASA mission context appear in the UI. They do not validate project bands.

Checkboxes track review actions locally and never suppress an alert or change
model inputs. They reset on direction/severity/source changes or component
remount. No medical-event submission or persistent acknowledgement is implied.

Only frontend files changed. Static source/wiring review performed; no runtime
tests, model inference, services or Bluetooth sessions executed automatically.

## EVEA in Summary

EVEA computation was moved unchanged to src/eveaEngine.js. Both the dedicated
EVEA tab and Summary now read the same session sequence through
src/useEveaAssessment.js, including edits previewed after the saved sequence.
Saved assessments are still counted once. No model parameters were changed.

Summary shows all four dimension averages, the exact HMM classification, saved
versus preview state, and a behavioral-health group. The overall banner also
considers EVEA. Recommended actions include dimension-specific support prompts
and a general follow-up checklist for every Warning or Critical HMM result,
even when no individual dimension is flagged.

Project review thresholds are >=5 for anxiety, anger and sadness and <=4 for
joy. A dimension flag raises the review status to Warning even if the HMM says
Normal; both statuses remain explicitly visible. These prompts are not validated
EVEA clinical cutoffs. The existing HMM JSON declares simulation provenance.
NASA behavioral-health resources inform the support context, not these cutoffs.
EVEA does not overwrite XGBoost inputs or the watch-derived stress indicator.

## Compact overview

Summary now has Overview, Heart rate trend and Model details views. The default
Overview groups the status banner, eight readings, four EVEA dimensions and an
activity strip into a compact desktop layout. At desktop widths of 1024px or
more the grids use four columns, with reduced spacing below 800px viewport height.
Mobile and zoomed layouts retain normal document scrolling without clipping.
Exact screen fit depends on viewport, zoom, connection errors and CSV notices.

The status area now follows the reference's prominent white hero card with a
severity-colored outline: headline, current alert values and two prioritized
action previews on the left, health-system statuses on the right. There is no
index, health percentage or circular gauge. Previews prioritize critical
conditions and retain View all actions for the complete recommendations. Counts
and group badges come from current shared data; unavailable MARES readings are
not represented as a normal system. On narrow screens the columns stack.

Amber and red backgrounds, borders, text labels and warning symbols distinguish
flagged readings in Summary and Model Input. EVEA review flags are amber.
No thresholds or predictions changed for this presentation update. The stress
indicator is not assigned an invented parameter threshold.

Review actions opens all recommendations in a native dialog; parameter Details
or Review opens its dedicated dialog. Escape/Close returns to the overview.
Trend and model details remain available from the summary navigation. No runtime
or visual tests were performed; source, imports and patch whitespace reviewed.
