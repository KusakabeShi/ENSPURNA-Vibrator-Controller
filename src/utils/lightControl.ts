import type { ServerSettings } from '../state/types';

const appendQuery = (url: string, params: Record<string, string | number>) => {
  const hasQuery = url.includes('?');
  const separator = hasQuery ? '&' : '?';
  const search = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${url}${separator}${search}`;
};

export const buildApiUrl = (settings: ServerSettings, on: boolean) => {
  const { apiEndpoint, apiKey } = settings;
  if (!apiEndpoint) {
    throw new Error('Missing API endpoint');
  }
  if (!apiKey) {
    throw new Error('Missing API key');
  }
  return appendQuery(apiEndpoint, {
    apikey: apiKey,
    value: on ? 1 : 0,
  });
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
