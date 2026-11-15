export function getPredictionStatus(value) {
  if (value < 1) return 'normal';
  if (value <= 1.5) return 'warning';
  return 'critical';
}
