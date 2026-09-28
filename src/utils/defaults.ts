import { STAGES } from '../constants/stages';
import type { LightApiPreset, ServerSettings, StageParameters } from '../state/types';

export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  lightOnUrl: '',
  lightOffUrl: '',
  compatibleMode: false,
  compatibleDelaySeconds: 0.1,
  signallingBaseUrl: '',
};

// Starting points for common plugs; users replace the IP / key and save their own presets.
export const BUILTIN_LIGHT_PRESETS: LightApiPreset[] = [
  {
    name: 'Espurna (template)',
    onUrl: 'http://192.168.66.238/api/relay/0?apikey=YOUR_KEY&value=1',
    offUrl: 'http://192.168.66.238/api/relay/0?apikey=YOUR_KEY&value=0',
  },
  {
    name: 'Tasmota (template)',
    onUrl: 'http://192.168.66.90/cm?cmnd=Power%20On',
    offUrl: 'http://192.168.66.90/cm?cmnd=Power%20Off',
  },
];

export const buildDefaultStageParameters = (): StageParameters => {
  return STAGES.reduce((acc, stage) => {
    acc[stage.id] = stage.parameterDefs.reduce((params, def) => {
      params[def.key] = def.defaultValue;
      return params;
    }, {} as Record<string, string>);
    return acc;
  }, {} as StageParameters);
};
