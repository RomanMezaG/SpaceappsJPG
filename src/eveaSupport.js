// Review prompts for the prototype, not validated EVEA diagnostic cutoffs.
const dimensions = [
  { key: 'ansiedad', title: 'Anxiety', actions: ['Take a short quiet break and record the main sources of tension.', 'Review workload and the next rest period with the crew lead.'] },
  { key: 'ira', title: 'Anger', actions: ['Pause a tense interaction and allow time to settle before continuing.', 'Arrange a calm crew discussion or a private support conversation.'] },
  { key: 'tristeza', title: 'Sadness', actions: ['Arrange a private check-in with behavioral health support or a trusted crewmate.', 'Plan contact with family or ground support when communication permits.'] },
  { key: 'alegria', title: 'Joy', actions: ['Make time for a personally meaningful leisure activity.', 'Review opportunities for social connection and a regular rest routine.'] },
];

export function getEveaSupport(evaluation) {
  const modelStatus = !evaluation ? 'unknown' : evaluation.estado === 'critic' ? 'critical' : evaluation.estado;
  const items = dimensions.map((dimension) => {
    const value = evaluation?.puntajes[dimension.key];
    const flagged = Number.isFinite(value) && (dimension.key === 'alegria' ? value <= 4 : value >= 5);
    return { ...dimension, value, flagged };
  });
  const flags = items.filter((item) => item.flagged);
  const status = modelStatus === 'critical' ? 'critical' : modelStatus === 'warning' || flags.length ? 'warning' : modelStatus;
  return { items, flags, modelStatus, status };
}
