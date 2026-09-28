import Cookies from 'js-cookie';
import type { LightApiPreset, ServerSettings, StageParameters } from '../state/types';
import { DEFAULT_SERVER_SETTINGS, buildDefaultStageParameters } from './defaults';

const SERVER_SETTINGS_KEY = 'enspurna_server_settings';
const STAGE_PARAMETERS_KEY = 'enspurna_stage_parameters';
const CLIENT_LAST_OFFER_KEY = 'enspurna_client_offer';
const ADMIN_PASSWORD_KEY = 'enspurna_admin_password';
const LIGHT_PRESETS_KEY = 'enspurna_light_presets';

const COOKIE_OPTIONS = {
  expires: 365,
};

export const loadServerSettings = (): ServerSettings => {
  try {
    const raw = Cookies.get(SERVER_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SERVER_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<ServerSettings> & { apiEndpoint?: string; apiKey?: string };
    const { apiEndpoint, apiKey, ...rest } = parsed;
    const settings: ServerSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      ...rest,
    };
    // Migrate the old Espurna-only endpoint + key settings into explicit ON/OFF URLs.
    if (!settings.lightOnUrl && !settings.lightOffUrl && apiEndpoint) {
      const separator = apiEndpoint.includes('?') ? '&' : '?';
      const base = `${apiEndpoint}${separator}apikey=${encodeURIComponent(apiKey ?? '')}&value=`;
      settings.lightOnUrl = `${base}1`;
      settings.lightOffUrl = `${base}0`;
    }
    return settings;
  } catch (error) {
    console.warn('Failed to parse server settings cookie', error);
    return DEFAULT_SERVER_SETTINGS;
  }
};

export const saveServerSettings = (settings: ServerSettings) => {
  Cookies.set(SERVER_SETTINGS_KEY, JSON.stringify(settings), COOKIE_OPTIONS);
};

export const loadStageParameters = (): StageParameters => {
  const defaults = buildDefaultStageParameters();
  try {
    const raw = Cookies.get(STAGE_PARAMETERS_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as StageParameters;
    const merged: StageParameters = { ...defaults };
    Object.entries(parsed).forEach(([stageKey, params]) => {
      const target = { ...merged[stageKey as keyof StageParameters] };
      Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          return;
        }
        target[key] = typeof value === 'number' ? value.toString() : String(value);
      });
      merged[stageKey as keyof StageParameters] = target;
    });
    return merged;
  } catch (error) {
    console.warn('Failed to parse stage parameters cookie', error);
    return defaults;
  }
};

export const saveStageParameters = (parameters: StageParameters) => {
  Cookies.set(STAGE_PARAMETERS_KEY, JSON.stringify(parameters), COOKIE_OPTIONS);
};

export const saveClientLastOffer = (offer: string) => {
  Cookies.set(CLIENT_LAST_OFFER_KEY, offer, COOKIE_OPTIONS);
};

export const loadClientLastOffer = (): string => {
  return Cookies.get(CLIENT_LAST_OFFER_KEY) ?? '';
};

export const saveAdminPassword = (password: string) => {
  Cookies.set(ADMIN_PASSWORD_KEY, password, COOKIE_OPTIONS);
};

export const loadAdminPassword = (): string => {
  return Cookies.get(ADMIN_PASSWORD_KEY) ?? '';
};

export const loadLightPresets = (): LightApiPreset[] => {
  try {
    const raw = Cookies.get(LIGHT_PRESETS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as LightApiPreset[];
    return Array.isArray(parsed)
      ? parsed.filter((preset) => preset && typeof preset.name === 'string')
      : [];
  } catch (error) {
    console.warn('Failed to parse light presets cookie', error);
    return [];
  }
};

export const saveLightPresets = (presets: LightApiPreset[]) => {
  Cookies.set(LIGHT_PRESETS_KEY, JSON.stringify(presets), COOKIE_OPTIONS);
};
