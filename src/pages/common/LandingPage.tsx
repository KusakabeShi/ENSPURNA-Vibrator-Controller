import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Container,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useServerContext } from '../../state/ServerContext';
import { isLightApiConfigured, triggerLight } from '../../utils/lightControl';
import type { LightApiPreset } from '../../state/types';
import { BUILTIN_LIGHT_PRESETS } from '../../utils/defaults';
import { loadLightPresets, saveLightPresets } from '../../utils/storage';

const LandingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const {
    settings,
    updateSettings,
    enterInit,
    signallingError,
    sharedState,
  } = useServerContext();

  const clientOnly = searchParams.get('clientonly') === 'true';
  const incomingSignallingUrl = (searchParams.get('signalling_url') ?? '').trim();
  const locationError = (location.state as { error?: string } | undefined)?.error;

  const [snackbar, setSnackbar] = useState<{ message: string; open: boolean }>({ message: '', open: false });
  const incomingAdminPassword = (searchParams.get('admin_password') ?? '').trim();
  const [adminPasswordInput, setAdminPasswordInput] = useState(incomingAdminPassword);
  const [signallingUrlInput, setSignallingUrlInput] = useState(incomingSignallingUrl);
  const [clientSelectionError, setClientSelectionError] = useState<string | null>(null);

  const showMessage = useCallback((message: string) => {
    setSnackbar({ message, open: true });
  }, []);

  useEffect(() => {
    if (locationError) {
      showMessage(locationError);
      navigate(location.pathname + location.search, { replace: true, state: undefined });
    }
  }, [locationError, location.pathname, location.search, navigate, showMessage]);

  useEffect(() => {
    setSignallingUrlInput(incomingSignallingUrl);
    setAdminPasswordInput(incomingAdminPassword);
  }, [incomingAdminPassword, incomingSignallingUrl]);

  const handleCloseSnackbar = useCallback(() => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  }, []);

  const handleTestLight = useCallback(
    async (on: boolean) => {
      if (!isLightApiConfigured(settings)) {
        showMessage('Set both ON and OFF URLs first.');
        return;
      }
      await triggerLight(on, settings);
      showMessage(`Sent light ${on ? 'ON' : 'OFF'} command.`);
    },
    [settings, showMessage],
  );

  const [savedPresets, setSavedPresets] = useState<LightApiPreset[]>(() => loadLightPresets());
  const [presetName, setPresetName] = useState('');

  // Highlight the preset whose URLs match the current settings, if any.
  const matchingPresetKey = useMemo(() => {
    const matches = (preset: LightApiPreset) =>
      preset.onUrl === settings.lightOnUrl && preset.offUrl === settings.lightOffUrl;
    const savedIndex = savedPresets.findIndex(matches);
    if (savedIndex >= 0) {
      return `saved:${savedIndex}`;
    }
    const builtinIndex = BUILTIN_LIGHT_PRESETS.findIndex(matches);
    return builtinIndex >= 0 ? `builtin:${builtinIndex}` : '';
  }, [savedPresets, settings.lightOffUrl, settings.lightOnUrl]);

  const handleSelectPreset = useCallback(
    (key: string) => {
      const [source, indexRaw] = key.split(':');
      const list = source === 'saved' ? savedPresets : BUILTIN_LIGHT_PRESETS;
      const preset = list[Number(indexRaw)];
      if (!preset) {
        return;
      }
      updateSettings({ lightOnUrl: preset.onUrl, lightOffUrl: preset.offUrl });
      if (source === 'saved') {
        setPresetName(preset.name);
      }
    },
    [savedPresets, updateSettings],
  );

  const handleSavePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name || !isLightApiConfigured(settings)) {
      return;
    }
    const preset = { name, onUrl: settings.lightOnUrl.trim(), offUrl: settings.lightOffUrl.trim() };
    const next = [...savedPresets.filter((item) => item.name !== name), preset];
    saveLightPresets(next);
    setSavedPresets(next);
    showMessage(`Saved preset "${name}".`);
  }, [presetName, savedPresets, settings, showMessage]);

  const handleDeletePreset = useCallback(() => {
    if (!matchingPresetKey.startsWith('saved:')) {
      return;
    }
    const index = Number(matchingPresetKey.split(':')[1]);
    const removed = savedPresets[index];
    const next = savedPresets.filter((_, i) => i !== index);
    saveLightPresets(next);
    setSavedPresets(next);
    showMessage(`Deleted preset "${removed?.name}".`);
  }, [matchingPresetKey, savedPresets, showMessage]);

  const navigateToClient = useCallback(() => {
    setClientSelectionError(null);
    const params = new URLSearchParams();
    const trimmedUrl = signallingUrlInput.trim();
    const trimmedPassword = adminPasswordInput.trim();

    if (trimmedUrl) {
      params.set('signalling_url', trimmedUrl);
    }
    if (clientOnly) {
      params.set('clientonly', 'true');
    }

    const path = trimmedPassword ? '/client/admin' : '/client/normal';
    if (trimmedPassword) {
      params.set('admin_password', trimmedPassword);
    }

    navigate(`${path}${params.toString() ? `?${params.toString()}` : ''}`);
  }, [adminPasswordInput, clientOnly, navigate, signallingUrlInput]);

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Stack spacing={4}>
        <Box textAlign="center">
          <Typography variant="h4" gutterBottom>
            Enspurna Light Control
          </Typography>
          <Typography color="text.secondary">
            Choose how you want to participate in the session.
          </Typography>
        </Box>

        {!clientOnly && (
          <Card variant="outlined">
            <CardHeader title="Server Setup" subheader="Configure the controller and start hosting." />
            <CardContent>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    select
                    label="Light API Preset"
                    value={matchingPresetKey}
                    onChange={(event) => handleSelectPreset(event.target.value)}
                    helperText="Pick a template or a saved preset to fill the URLs below."
                    fullWidth
                  >
                    <MenuItem value="" disabled>
                      Custom
                    </MenuItem>
                    {BUILTIN_LIGHT_PRESETS.map((preset, index) => (
                      <MenuItem key={`builtin:${index}`} value={`builtin:${index}`}>
                        {preset.name}
                      </MenuItem>
                    ))}
                    {savedPresets.map((preset, index) => (
                      <MenuItem key={`saved:${index}`} value={`saved:${index}`}>
                        {preset.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button
                    color="error"
                    onClick={handleDeletePreset}
                    disabled={!matchingPresetKey.startsWith('saved:')}
                    sx={{ alignSelf: { sm: 'flex-start' }, mt: { sm: 1 } }}
                  >
                    Delete
                  </Button>
                </Stack>
                <TextField
                  label="Light ON URL"
                  value={settings.lightOnUrl}
                  onChange={(event) => updateSettings({ lightOnUrl: event.target.value })}
                  placeholder="http://192.168.66.90/cm?cmnd=Power%20On"
                  fullWidth
                />
                <TextField
                  label="Light OFF URL"
                  value={settings.lightOffUrl}
                  onChange={(event) => updateSettings({ lightOffUrl: event.target.value })}
                  placeholder="http://192.168.66.90/cm?cmnd=Power%20Off"
                  fullWidth
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="Preset Name"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="Bedroom Tasmota"
                    helperText="Saving with an existing name overwrites it."
                    fullWidth
                  />
                  <Button
                    variant="outlined"
                    onClick={handleSavePreset}
                    disabled={!presetName.trim() || !isLightApiConfigured(settings)}
                    sx={{ alignSelf: { sm: 'flex-start' }, mt: { sm: 1 }, whiteSpace: 'nowrap' }}
                  >
                    Save Preset
                  </Button>
                </Stack>
                <TextField
                  label="Signalling Server Base URL"
                  value={settings.signallingBaseUrl}
                  onChange={(event) => updateSettings({ signallingBaseUrl: event.target.value })}
                  placeholder="https://example.com/signal"
                  fullWidth
                  helperText="Optional. Enables automatic offer/answer exchange when provided."
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.compatibleMode}
                      onChange={(_, checked) => updateSettings({ compatibleMode: checked })}
                    />
                  }
                  label="Compatible mode (use window.open instead of fetch)"
                />
                {settings.compatibleMode && (
                  <TextField
                    label="API Window Delay (seconds)"
                    type="number"
                    inputProps={{ min: 0, step: 0.1 }}
                    value={settings.compatibleDelaySeconds}
                    onChange={(event) => updateSettings({ compatibleDelaySeconds: Number(event.target.value) })}
                  />
                )}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button
                    variant="contained"
                    onClick={() => handleTestLight(true)}
                    disabled={!isLightApiConfigured(settings)}
                  >
                    Test On
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => handleTestLight(false)}
                    disabled={!isLightApiConfigured(settings)}
                  >
                    Test Off
                  </Button>
                  <Box flexGrow={1} />
                  <Button color="secondary" variant="contained" onClick={() => {
                    enterInit();
                    navigate('/server');
                  }}>
                    Start Server Mode
                  </Button>
                </Stack>
                {signallingError && <Alert severity="error">{signallingError}</Alert>}
                <Alert severity="info">Current admin password: {sharedState.adminPassword}</Alert>
              </Stack>
            </CardContent>
          </Card>
        )}

        <Card variant="outlined">
          <CardHeader
            title="Join as Client"
            subheader={
              clientOnly
                ? 'Connect using the provided signalling link.'
                : 'Enter signalling details and optionally the admin password.'
            }
          />
          <CardContent>
            <Stack spacing={2}>
              {clientSelectionError && <Alert severity="error">{clientSelectionError}</Alert>}
              <TextField
                label="Signalling Session URL"
                value={signallingUrlInput}
                onChange={(event) => setSignallingUrlInput(event.target.value)}
                placeholder="https://example.com/prefix/room"
                helperText="Paste the client signalling URL if provided"
                fullWidth
              />
              <TextField
                label="Admin Password (optional)"
                type="password"
                value={adminPasswordInput}
                onChange={(event) => setAdminPasswordInput(event.target.value)}
                placeholder="Enter admin password to join as admin"
                helperText="Leave blank for normal client"
                fullWidth
              />
              <Button variant="contained" onClick={navigateToClient}>
                Connect
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Snackbar
        open={snackbar.open}
        message={snackbar.message}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
      />
    </Container>
  );
};

export default LandingPage;
