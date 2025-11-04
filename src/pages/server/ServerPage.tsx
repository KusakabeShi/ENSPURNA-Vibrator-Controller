import { useCallback, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CardHeader, Container, Divider, Stack, TextField, Typography } from '@mui/material';
import { QRCodeCanvas } from 'qrcode.react';
import { STAGES } from '../../constants/stages';
import type { StageDefinition, StageKey } from '../../constants/stages';
import StageParameterEditor from '../../components/StageParameterEditor';
import StageTimeline from '../../components/StageTimeline';
import { useServerContext } from '../../state/ServerContext';
import { useNavigate } from 'react-router-dom';
import type { StageParameters } from '../../state/types';
import { formatDuration } from '../../utils/formatters';
import { formatTimeSettingSummary } from '../../utils/stageHelpers';

const OfferSection = ({
  title,
  description,
  value,
  onCopy,
}: {
  title: string;
  description: string;
  value: string;
  onCopy: () => void;
}) => (
  <Card variant="outlined">
    <CardHeader title={title} />
    <CardContent>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="stretch">
        <Box flex={1} display="flex" justifyContent="center">
          <QRCodeCanvas value={value || ' '} size={220} includeMargin />
        </Box>
        <Stack spacing={2} flex={1}>
          <TextField label={title} multiline minRows={6} value={value} fullWidth InputProps={{ readOnly: true }} />
          <Button variant="contained" onClick={onCopy} disabled={!value}>
            Copy
          </Button>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Stack>
      </Stack>
    </CardContent>
  </Card>
);

const StageForms = ({
  stageParameters,
  onChange,
}: {
  stageParameters: StageParameters;
  onChange: (stage: StageDefinition, key: string, value: string) => void;
}) => (
  <Stack spacing={2}>
    {STAGES.map((stage) => (
      <StageParameterEditor
        key={stage.id}
        stage={stage}
        values={stageParameters[stage.id] ?? {}}
        onChange={(key, value) => onChange(stage, key, value)}
      />
    ))}
  </Stack>
);

const ServerInitView = () => {
  const {
    settings,
    stageParameters,
    updateStageParameter,
    sharedState,
    currentOffer,
    acceptAnswer,
    startSequence,
    peers,
    signallingShareUrl,
    signallingError,
  } = useServerContext();
  const [answerSdp, setAnswerSdp] = useState('');
  const [accepting, setAccepting] = useState(false);
  const navigate = useNavigate();
  const isAutomatic = settings.signallingBaseUrl.trim().length > 0;

  const handleGoToLanding = useCallback(
    (message?: string) => {
      if (message) {
        navigate('/', { state: { error: message } });
      } else {
        navigate('/');
      }
    },
    [navigate],
  );

  const handleAcceptAnswer = useCallback(async () => {
    if (!currentOffer?.peerId || !answerSdp.trim()) {
      return;
    }
    try {
      setAccepting(true);
      await acceptAnswer(currentOffer.peerId, answerSdp.trim());
      setAnswerSdp('');
    } finally {
      setAccepting(false);
    }
  }, [acceptAnswer, answerSdp, currentOffer]);

  const handleCopyOffer = useCallback(() => {
    if (!currentOffer?.sdp) {
      return;
    }
    void navigator.clipboard?.writeText(currentOffer.sdp);
  }, [currentOffer]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={4}>
        <Stack spacing={1}>
          <Typography variant="h4">Server Init</Typography>
          <Typography color="text.secondary">
            Adjust stage parameters, share the offer, and start the session when you are ready.
          </Typography>
          <Alert severity="info">Admin password: {sharedState.adminPassword}</Alert>
        </Stack>

        {isAutomatic ? (
          <Stack spacing={2}>
            {signallingError ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={() => handleGoToLanding(signallingError)}>
                    Adjust Settings
                  </Button>
                }
              >
                {signallingError}
              </Alert>
            ) : signallingShareUrl ? (
              <OfferSection
                title="Client Link"
                description="Share this link (QR or text) with participants. Clients will exchange automatically."
                value={signallingShareUrl}
                onCopy={() => signallingShareUrl && navigator.clipboard?.writeText(signallingShareUrl)}
              />
            ) : (
              <Alert severity="info">Publishing offer to signalling server...</Alert>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Box flexGrow={1} />
              <Button color="secondary" variant="contained" onClick={startSequence}>
                Start Session
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2}>
            {currentOffer ? (
              <OfferSection
                title="SDP Offer"
                description="Share this offer with clients. They must paste it to create their answer."
                value={currentOffer.sdp}
                onCopy={handleCopyOffer}
              />
            ) : (
              <Alert severity="info">Generating SDP offer...</Alert>
            )}
            <Card variant="outlined">
              <CardHeader title="Client Answer" subheader="Paste the SDP answer produced by a client to finalize the link." />
              <CardContent>
                <Stack spacing={2}>
                  <TextField
                    label="Answer SDP"
                    multiline
                    minRows={6}
                    value={answerSdp}
                    onChange={(event) => setAnswerSdp(event.target.value)}
                    placeholder="Paste the answer generated by a client"
                    disabled={!currentOffer}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button
                      variant="contained"
                      onClick={handleAcceptAnswer}
                      disabled={!answerSdp.trim() || accepting || !currentOffer}
                    >
                      Accept Answer
                    </Button>
                    <Box flexGrow={1} />
                    <Button color="secondary" variant="contained" onClick={startSequence}>
                      Start Session
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}

        <StageForms
          stageParameters={stageParameters}
          onChange={(stage, key, value) => updateStageParameter(stage.id, key, value)}
        />

        <Card variant="outlined">
          <CardHeader title="Connected Peers" />
          <CardContent>
            {peers.length === 0 ? (
              <Typography color="text.secondary">No peers connected yet.</Typography>
            ) : (
              <Stack spacing={1}>
                {peers.map((peer) => (
                  <Typography key={peer.id}>
                    {peer.id.slice(0, 8)} · {peer.role} · {peer.connection.connectionState} ·{' '}
                    {peer.authenticated ? 'authenticated' : 'pending'}
                  </Typography>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
};

const getStageHelperText = (stage: StageKey, stageParameters: StageParameters) => {
  const values = stageParameters[stage] ?? {};
  switch (stage) {
    case 'prepare':
      return `Lights off for ${formatTimeSettingSummary(values.durationMinutes)} minutes.`;
    case 'blanking_1':
    case 'blanking_2':
      return `Blanking for ${formatTimeSettingSummary(values.totalMinutes)} minutes (on ${formatTimeSettingSummary(values.lightOnWait)}s / off ${formatTimeSettingSummary(values.lightOffWait)}s).`;
    case 'light_on':
      return `Lights on: continue after ${formatTimeSettingSummary(values.minMinutes)} minutes, auto advance at ${formatTimeSettingSummary(values.maxMinutes)} minutes.`;
    case 'rest':
      return `Rest for ${formatTimeSettingSummary(values.durationMinutes)} minutes.`;
    default:
      return '';
  }
};

const ServerRunningView = () => {
  const { sharedState, goToStage, continueStage, stageParameters, settings, signallingShareUrl } = useServerContext();
  const isAutomatic = settings.signallingBaseUrl.trim().length > 0;
  const shareLink = signallingShareUrl;

  const stageHelper = useMemo(
    () => getStageHelperText(sharedState.currentStage, stageParameters),
    [sharedState.currentStage, stageParameters],
  );

  const timeRemaining = formatDuration(sharedState.stageRemainingSeconds);
  const timeElapsed = formatDuration(sharedState.stageElapsedSeconds);
  const lightEmoji = sharedState.lightOn ? '🟢' : '🔴';

  const showContinueButton = sharedState.currentStage === 'light_on';
  const continueDisabled = !sharedState.allowContinue;

  return (
    <Box sx={{ position: 'relative', minHeight: '100vh' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={4}>
          <Stack spacing={1}>
            <Typography variant="h4">Server Control</Typography>
            <Typography color="text.secondary">Loop #{sharedState.loopIteration}</Typography>
          </Stack>

          <Card variant="outlined">
            <CardContent>
              <Stack spacing={2}>
                <StageTimeline currentStage={sharedState.currentStage} onSelect={goToStage} />
                <Typography variant="subtitle1">{stageHelper}</Typography>
                <Divider />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                  <Typography variant="h6">Elapsed: {timeElapsed}</Typography>
                  <Typography variant="h6">Remaining: {timeRemaining}</Typography>
                  <Box flexGrow={1} />
                  <Typography variant="h6" display="flex" alignItems="center" gap={1}>
                    Light Status: {lightEmoji}
                  </Typography>
                </Stack>
                {showContinueButton ? (
                  <Button
                    variant="contained"
                    color="primary"
                    disabled={continueDisabled}
                    onClick={continueStage}
                  >
                    {continueDisabled ? 'Continue (not ready)' : 'Continue'}
                  </Button>
                ) : (
                  <Button variant="outlined" disabled>
                    Unavailable
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Container>

      {isAutomatic && shareLink && (
        <Box
          sx={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            width: 260,
            zIndex: 10,
          }}
        >
          <Card variant="outlined" sx={{ borderTop: '4px solid #1976d2' }}>
            <CardHeader title="Quick Connect" subheader={`Admin password: ${sharedState.adminPassword}`} />
            <CardContent>
              <Box display="flex" justifyContent="center" mb={2}>
                <QRCodeCanvas value={shareLink} size={180} includeMargin />
              </Box>
              <Typography variant="caption" display="block" sx={{ wordBreak: 'break-all' }}>
                {shareLink}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};

const ServerPage = () => {
  const { sharedState } = useServerContext();

  if (sharedState.status === 'wait_init') {
    return <ServerInitView />;
  }

  return <ServerRunningView />;
};

export default ServerPage;
