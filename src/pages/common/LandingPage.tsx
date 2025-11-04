import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Container,
  FormControlLabel,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useServerContext } from '../../state/ServerContext';
import { triggerLight } from '../../utils/lightControl';

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
      if (!settings.apiEndpoint || !settings.apiKey) {
        showMessage('Set API endpoint and key first.');
        return;
      }
      await triggerLight(on, settings);
      showMessage(`Sent light ${on ? 'ON' : 'OFF'} command.`);
    },
    [settings, showMessage],
  );

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
                <TextField
                  label="API Endpoint"
                  value={settings.apiEndpoint}
                  onChange={(event) => updateSettings({ apiEndpoint: event.target.value })}
                  placeholder="http://192.168.66.238/api/relay/0"
                  fullWidth
                />
                <TextField
                  label="API Key"
                  value={settings.apiKey}
                  onChange={(event) => updateSettings({ apiKey: event.target.value })}
                  fullWidth
                />
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
                    disabled={!settings.apiEndpoint || !settings.apiKey}
                  >
                    Test On
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => handleTestLight(false)}
                    disabled={!settings.apiEndpoint || !settings.apiKey}
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
