import { STAGES } from '../constants/stages';
import type { StageParameters } from '../state/types';

export const DEFAULT_SERVER_SETTINGS = {
  apiEndpoint: '',
  apiKey: '',
  compatibleMode: false,
  compatibleDelaySeconds: 0.1,
  signallingBaseUrl: '',
};

export const buildDefaultStageParameters = (): StageParameters => {
  return STAGES.reduce((acc, stage) => {
    acc[stage.id] = stage.parameterDefs.reduce((params, def) => {
      params[def.key] = def.defaultValue;
      return params;
    }, {} as Record<string, string>);
    return acc;
  }, {} as StageParameters);
};
