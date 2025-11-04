import type { StageKey } from '../constants/stages';
import type { StageParameterValues, StageParameters } from '../state/types';

export interface TimeSample {
  seconds: number;
  minSeconds: number;
  maxSeconds: number;
  base: number;
  offset: number;
}

const clamp = (value: number) => (Number.isFinite(value) ? value : 0);

export const parseTimeSetting = (
  raw: string | number | undefined,
  unit: 'minutes' | 'seconds',
): TimeSample => {
  const multiplier = unit === 'minutes' ? 60 : 1;
  if (typeof raw === 'number') {
    const seconds = clamp(raw * multiplier);
    return {
      seconds,
      minSeconds: Math.max(0, seconds),
      maxSeconds: Math.max(0, seconds),
      base: clamp(raw),
      offset: 0,
    };
  }
  const text = String(raw ?? '').trim();
  if (!text) {
    return {
      seconds: 0,
      minSeconds: 0,
      maxSeconds: 0,
      base: 0,
      offset: 0,
    };
  }
  const [baseRaw, offsetRaw] = text.split(',').map((part) => part.trim());
  const base = clamp(parseFloat(baseRaw));
  const offset = clamp(offsetRaw !== undefined ? parseFloat(offsetRaw) : 0);
  const min = Math.max(0, (base - Math.abs(offset)) * multiplier);
  const max = Math.max(min, (base + Math.abs(offset)) * multiplier);
  return {
    seconds: max,
    minSeconds: min,
    maxSeconds: max,
    base,
    offset,
  };
};

export const sampleTimeSetting = (
  raw: string | number | undefined,
  unit: 'minutes' | 'seconds',
): TimeSample => {
  const parsed = parseTimeSetting(raw, unit);
  if (parsed.maxSeconds <= parsed.minSeconds) {
    return {
      ...parsed,
      seconds: parsed.minSeconds,
    };
  }
  const seconds = parsed.minSeconds + Math.random() * (parsed.maxSeconds - parsed.minSeconds);
  return {
    ...parsed,
    seconds,
  };
};

const getStageValues = (stage: StageKey, parameters: StageParameters): StageParameterValues => {
  return parameters[stage] ?? {};
};

export const sampleStageDurationSeconds = (stage: StageKey, parameters: StageParameters): number => {
  const values = getStageValues(stage, parameters);
  switch (stage) {
    case 'prepare':
    case 'rest': {
      return sampleTimeSetting(values.durationMinutes, 'minutes').seconds;
    }
    case 'blanking_1':
    case 'blanking_2': {
      return sampleTimeSetting(values.totalMinutes, 'minutes').seconds;
    }
    case 'light_on': {
      const maxSample = sampleTimeSetting(values.maxMinutes, 'minutes');
      return maxSample.seconds;
    }
    default:
      return 0;
  }
};

export const sampleBlankingWaitSeconds = (
  stage: StageKey,
  parameters: StageParameters,
  keepLightOn: boolean,
): number => {
  const values = getStageValues(stage, parameters);
  const key = keepLightOn ? 'lightOnWait' : 'lightOffWait';
  return sampleTimeSetting(values[key], 'seconds').seconds;
};

export const sampleLightOnThresholds = (
  parameters: StageParameters,
): { minSeconds: number; maxSeconds: number } => {
  const values = parameters.light_on ?? {};
  const minSample = sampleTimeSetting(values.minMinutes, 'minutes');
  const maxSample = sampleTimeSetting(values.maxMinutes, 'minutes');
  const minSeconds = minSample.seconds;
  const maxSeconds = Math.max(minSeconds, maxSample.seconds);
  return { minSeconds, maxSeconds };
};

export const formatTimeSettingSummary = (raw: string | undefined): string => {
  if (!raw) {
    return '0';
  }
  const [base, offset] = raw.split(',').map((value) => value.trim());
  if (!offset) {
    return base;
  }
  return `${base} ± ${offset}`;
};
