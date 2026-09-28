import type { ServerSettings } from '../state/types';

export const isLightApiConfigured = (settings: ServerSettings) => {
  return Boolean(settings.lightOnUrl.trim() && settings.lightOffUrl.trim());
};

export const buildApiUrl = (settings: ServerSettings, on: boolean) => {
  const url = (on ? settings.lightOnUrl : settings.lightOffUrl).trim();
  if (!url) {
    throw new Error(`Missing light ${on ? 'ON' : 'OFF'} URL`);
  }
  return url;
};

export const triggerLight = async (on: boolean, settings: ServerSettings) => {
  try {
    const url = buildApiUrl(settings, on);
    if (settings.compatibleMode) {
      const win = window.open(url, '_blank');
      const delayMs = Math.max(0, settings.compatibleDelaySeconds * 1000);
      window.setTimeout(() => {
        win?.close();
      }, delayMs || 100);
      return;
    }
    await fetch(url, { mode: 'cors' });
  } catch (error) {
    console.error('Failed to trigger light API', error);
  }
};
