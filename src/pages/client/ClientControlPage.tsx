import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Container,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import StageTimeline from '../../components/StageTimeline';
import { STAGES } from '../../constants/stages';
import { useClientContext } from '../../state/ClientContext';
import type { StageKey } from '../../constants/stages';
import type { StageParameters } from '../../state/types';
import { formatDuration } from '../../utils/formatters';
import { formatTimeSettingSummary } from '../../utils/stageHelpers';

const stageNameMap = STAGES.reduce<Record<string, string>>((acc, stage) => {
  acc[stage.id] = stage.name;
  return acc;
}, {});

const buildStageSummary = (stage: StageKey, stageParameters: StageParameters | undefined) => {
  const values = stageParameters?.[stage] ?? {};
  switch (stage) {
    case 'prepare':
      return `Lights off for ${formatTimeSettingSummary(values.durationMinutes as string | undefined)} minutes.`;
    case 'blanking_1':
    case 'blanking_2':
      return `Blanking cycle on ${formatTimeSettingSummary(values.lightOnWait as string | undefined)}s · off ${formatTimeSettingSummary(values.lightOffWait as string | undefined)}s.`;
    case 'light_on':
      return `Light available ${formatTimeSettingSummary(values.minMinutes as string | undefined)}-${formatTimeSettingSummary(values.maxMinutes as string | undefined)} minutes.`;
    case 'rest':
      return `Rest for ${formatTimeSettingSummary(values.durationMinutes as string | undefined)} minutes.`;
    default:
      return '';
  }
};

const ClientControlPage = () => {
  const {
    role,
    sharedState,
    connectionState,
    channelState,
    sendStart,
    sendContinue,
    sendStageChange,
    disconnect,
    lastControlResponse,
    clearControlResponse,
    setStoredPassword,
  } = useClientContext();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');

  const isAdmin = role === 'client-admin';
  const isConnected = channelState === 'open';
  const signallingUrlParam = (searchParams.get('signalling_url') ?? '').trim();
  const clientOnlyParam = searchParams.get('clientonly') === 'true';
  const adminPasswordParam = (searchParams.get('admin_password') ?? '').trim();

  useEffect(() => {
    if (isAdmin && adminPasswordParam && !password) {
      setPassword(adminPasswordParam);
      setStoredPassword(adminPasswordParam);
    }
  }, [adminPasswordParam, isAdmin, password, setStoredPassword]);

  const currentStageName = sharedState ? stageNameMap[sharedState.currentStage] : 'Unknown';
  const timeRemaining = sharedState ? formatDuration(sharedState.stageRemainingSeconds) : '--:--';
  const timeElapsed = sharedState ? formatDuration(sharedState.stageElapsedSeconds) : '--:--';
  const stageSummary = sharedState ? buildStageSummary(sharedState.currentStage, sharedState.stageParameters) : '';

  const primaryAction = useMemo(() => {
    if (!sharedState) {
      return { label: 'Connect first', disabled: true, action: () => {} };
    }
    if (sharedState.status === 'wait_init') {
      return {
        label: 'Start',
        disabled: !isConnected,
        action: () => sendStart(password),
      };
    }
    if (sharedState.currentStage === 'light_on' && sharedState.allowContinue) {
      return {
        label: 'Continue',
        disabled: !isConnected || !sharedState.allowContinue,
        action: () => sendContinue(password),
      };
    }
    return {
      label: 'Unavailable',
      disabled: true,
      action: () => {},
    };
  }, [sharedState, isConnected, sendStart, sendContinue, password]);

  const handleStageSelect = useCallback(
    (stage: StageKey) => {
      if (!isAdmin || !isConnected) {
        return;
      }
      sendStageChange(stage, password);
    },
    [isAdmin, isConnected, password, sendStageChange],
  );

  const buildLandingSearch = useCallback(() => {
    const params = new URLSearchParams();
    if (signallingUrlParam) {
      params.set('signalling_url', signallingUrlParam);
    }
    if (clientOnlyParam) {
      params.set('clientonly', 'true');
    }
    return params.toString();
  }, [clientOnlyParam, signallingUrlParam]);

  const navigateToLanding = useCallback(
    (state?: { error: string }) => {
      const search = buildLandingSearch();
      const params = new URLSearchParams(search);
      if (password.trim()) {
        params.set('admin_password', password.trim());
      }
      navigate(`/${params.toString() ? `?${params.toString()}` : ''}`, { replace: true, state });
    },
    [buildLandingSearch, navigate, password],
  );

  useEffect(() => {
    if (!isConnected && !sharedState) {
      navigateToLanding();
    }
  }, [isConnected, navigateToLanding, sharedState]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setPassword('');
    setStoredPassword('');
    navigateToLanding();
  }, [disconnect, navigateToLanding, setStoredPassword]);

  const invalidPasswordResponse =
    lastControlResponse &&
    !lastControlResponse.success &&
    lastControlResponse.message?.toLowerCase().includes('invalid admin password');

  useEffect(() => {
    if (invalidPasswordResponse) {
      clearControlResponse();
      disconnect();
      setPassword('');
      setStoredPassword('');
      navigateToLanding({ error: 'Invalid admin password. Please try again.' });
    }
  }, [
    clearControlResponse,
    disconnect,
    invalidPasswordResponse,
    navigateToLanding,
    setStoredPassword,
  ]);

  const showControlResponse =
    lastControlResponse && (!invalidPasswordResponse || lastControlResponse.success);

  if (!sharedState) {
    return null;
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={4}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
          <Typography variant="h4">{isAdmin ? 'Admin Control' : 'Client Control'}</Typography>
          <Box flexGrow={1} />
          <Typography variant="body2" color="text.secondary">
            Connection: {connectionState} · Channel: {channelState}
          </Typography>
        </Stack>

        {showControlResponse && (
          <Alert
            severity={lastControlResponse!.success ? 'success' : 'error'}
            onClose={clearControlResponse}
          >
            {lastControlResponse!.message ??
              (lastControlResponse!.success ? 'Action accepted' : 'Action rejected')}
          </Alert>
        )}

        <Card variant="outlined">
          {isAdmin ? (
            <>
              <CardHeader title={`Stage · ${currentStageName}`} subheader={stageSummary} />
              <CardContent>
                <Stack spacing={3}>
                  <StageTimeline currentStage={sharedState.currentStage} onSelect={handleStageSelect} disabled={!isConnected} />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                    <Typography variant="h6">Elapsed: {timeElapsed}</Typography>
                    <Typography variant="h6">Remaining: {timeRemaining}</Typography>
                    <Box flexGrow={1} />
                    <Typography variant="h6" color="text.secondary">
                      Light: {sharedState.lightOn ? '🟢 On' : '🔴 Off'}
                    </Typography>
                  </Stack>
                  <Stack spacing={2} alignItems="center">
                    <Button
                      variant="contained"
                      color="primary"
                      disabled={primaryAction.disabled}
                      onClick={primaryAction.action}
                      sx={{ px: 6, py: 2, fontSize: '1.2rem' }}
                    >
                      {primaryAction.label}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </>
          ) : (
            <CardContent>
              <Stack spacing={2} alignItems="center">
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  disabled={primaryAction.disabled}
                  onClick={primaryAction.action}
                  sx={{ px: 6, py: 2, fontSize: '1.2rem' }}
                >
                  {primaryAction.label}
                </Button>
              </Stack>
            </CardContent>
          )}
        </Card>

        {isAdmin && (
          <Card variant="outlined">
            <CardHeader title="Admin Password" subheader="Required for stage changes and control actions." />
            <CardContent>
              <Stack spacing={2}>
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPassword(value);
                    setStoredPassword(value);
                  }}
                  placeholder="Enter the server-provided password"
                />
                <Alert severity="info">Password is cached for subsequent actions until you refresh or disconnect.</Alert>
              </Stack>
            </CardContent>
          </Card>
        )}

        <Button variant="outlined" color="inherit" onClick={handleDisconnect}>
          Disconnect
        </Button>
      </Stack>
    </Container>
  );
};

export default ClientControlPage;
