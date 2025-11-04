export const formatDuration = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  const minutesPart = `${hrs > 0 ? String(hrs).padStart(2, '0') + ':' : ''}${String(mins).padStart(2, '0')}`;
  return `${minutesPart}:${String(secs).padStart(2, '0')}`;
};

export const formatMinutes = (minutes: number): string => {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.round((minutes - Math.floor(minutes)) * 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (secs > 0) {
    return `${Math.floor(minutes)}m ${secs}s`;
  }
  return `${Math.floor(minutes)}m`;
};
