const OPM_TOTAL_LEVEL_RANGE_DB = 127 * 0.75;
export const OPM_MAX_PHASE_MODULATION_INDEX = 8 * Math.PI;

export function operatorLevelGain(level: number): number {
  const normalizedLevel = Math.min(1, Math.max(0, level));
  if (normalizedLevel === 0) return 0;

  const attenuationDb = (1 - normalizedLevel) * OPM_TOTAL_LEVEL_RANGE_DB;
  return 10 ** (-attenuationDb / 20);
}

export function opmModulationFrequencyDeviation(
  modulatorFrequency: number,
): number {
  return modulatorFrequency * OPM_MAX_PHASE_MODULATION_INDEX;
}
