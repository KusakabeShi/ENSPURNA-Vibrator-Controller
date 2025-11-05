import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CardHeader, Container, Stack, TextField, Typography } from '@mui/material';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useClientContext } from '../../state/ClientContext';
import type { AppRole } from '../../state/types';

const roleToPath = (role: AppRole): 'normal' | 'admin' => (role === 'client-admin' ? 'admin' : 'normal');

const ClientConnectPage = () => {
  const {
    role,
    connectionState,
    channelState,
    connectWithOffer,
    disconnect,
    lastOffer,
    setLastOffer,
    setStoredPassword,
  } = useClientContext();

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const signallingUrlParam = useMemo(() => (searchParams.get('signalling_url') ?? '').trim(), [searchParams]);
  const clientOnlyParam = searchParams.get('clientonly') === 'true';
  const adminPasswordParam = (searchParams.get('admin_password') ?? '').trim();

  const [offerInput, setOfferInput] = useState(lastOffer);
  const [answerOutput, setAnswerOutput] = useState('');
  const [offerError, setOfferError] = useState<string | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const [autoStatus, setAutoStatus] = useState<'idle' | 'fetching' | 'sending' | 'sent' | 'error'>('idle');
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const autoActiveRef = useRef(false);

  const isAdmin = role === 'client-admin';
  const isConnected = channelState === 'open';

  useEffect(() => {
    if (isAdmin && adminPasswordParam) {
      setStoredPassword(adminPasswordParam);
    }
  }, [adminPasswordParam, isAdmin, setStoredPassword]);

  const handleConnect = useCallback(async () => {
    setOfferError(null);
    setScannerMessage(null);
    try {
      const answer = await connectWithOffer(offerInput);
      setAnswerOutput(answer);
      if (signallingUrlParam) {
        const base = signallingUrlParam.replace(/\/$/, '');
        try {
          const response = await fetch(`${base}/answer`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: answer,
          });
          if (!response.ok) {
            throw new Error(`Answer publish failed (${response.status})`);
          }
          setAutoStatus('sent');
          setAutoMessage('Answer sent. Waiting for connection...');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to publish answer';
          setOfferError(message);
        }
      }
      return answer;
    } catch (error) {
      setOfferError(error instanceof Error ? error.message : 'Failed to prepare connection');
      throw error;
    }
  }, [connectWithOffer, offerInput, signallingUrlParam]);

  const handleCopyAnswer = useCallback(() => {
    if (!answerOutput) {
      return;
    }
    void navigator.clipboard?.writeText(answerOutput);
  }, [answerOutput]);

  const isSecureScannerContext = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const secure = window.isSecureContext || window.location.hostname === 'localhost';
    return secure;
  }, []);

  const enableScanner = isSecureScannerContext && !signallingUrlParam;

  const handleScannerScan = useCallback(
    (detected: Array<{ rawValue?: string | null }>) => {
      const first = detected?.[0]?.rawValue;
      if (!first) {
        return;
      }
      setOfferInput(first);
      setLastOffer(first);
      setScannerMessage('Offer populated from QR scan');
      setScannerError(null);
    },
    [setLastOffer],
  );

  const handleScannerError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unable to access camera';
    setScannerError(message);
  }, []);

  const buildLandingParams = useCallback(() => {
    const params = new URLSearchParams();
    if (signallingUrlParam) {
      params.set('signalling_url', signallingUrlParam);
    }
    if (clientOnlyParam) {
      params.set('clientonly', 'true');
    }
    if (adminPasswordParam) {
      params.set('admin_password', adminPasswordParam);
    }
    return params;
  }, [adminPasswordParam, clientOnlyParam, signallingUrlParam]);

  const navigateToLanding = useCallback(
    (state?: { error: string }) => {
      const params = buildLandingParams();
      navigate(`/${params.toString() ? `?${params.toString()}` : ''}`, { replace: true, state });
    },
    [buildLandingParams, navigate],
  );

  const resetConnection = useCallback(() => {
    disconnect();
    setAnswerOutput('');
    setAutoStatus('idle');
    setAutoMessage(null);
    autoActiveRef.current = false;
  }, [disconnect]);

  const handleDisconnect = useCallback(() => {
    resetConnection();
    navigateToLanding();
  }, [navigateToLanding, resetConnection]);

  useEffect(() => {
    if (!signallingUrlParam || isConnected || autoActiveRef.current) {
      return;
    }

    autoActiveRef.current = true;
    let cancelled = false;
    const base = signallingUrlParam.replace(/\/$/, '');
    const lastSlash = base.lastIndexOf('/');
    const prefixBase = lastSlash > 0 ? base.substring(0, lastSlash) : base;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const autoConnect = async () => {
      setAutoStatus('fetching');
      setAutoMessage('Retrieving offer from signalling server...');

      try {
        const verifyHealth = async () => {
          const prefixHealth = await fetch(`${prefixBase}/health`);
          if (!prefixHealth.ok) {
            throw new Error(`Signalling health failed (${prefixHealth.status})`);
          }
          const roomHealth = await fetch(`${base}/health`);
          if (!roomHealth.ok) {
            throw new Error(`Room health failed (${roomHealth.status})`);
          }
        };

        await verifyHealth();
        let offerText = '';
        while (!cancelled) {
          const offerResponse = await fetch(`${base}/offer`, { method: 'GET' });
          if (offerResponse.status === 404) {
            setAutoMessage('Waiting for server to publish offer...');
            await wait(2000);
            continue;
          }
          if (!offerResponse.ok) {
            throw new Error(`Offer fetch failed (${offerResponse.status})`);
          }
          offerText = (await offerResponse.text()).trim();
          if (!offerText) {
            setAutoMessage('Offer not ready yet, retrying...');
            await wait(2000);
            continue;
          }
          break;
        }

        if (cancelled) {
          return;
        }

        setOfferInput(offerText);
        setLastOffer(offerText);
        setAutoStatus('sending');
        setAutoMessage('Creating answer...');
        const answer = await connectWithOffer(offerText);

        if (cancelled) {
          return;
        }

        setAnswerOutput(answer);
        setAutoMessage('Publishing answer to signalling server...');
        const answerResponse = await fetch(`${base}/answer`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: answer,
        });
        if (!answerResponse.ok) {
          throw new Error(`Answer publish failed (${answerResponse.status})`);
        }

        if (cancelled) {
          return;
        }

        setAutoStatus('sent');
        setAutoMessage('Answer sent. Waiting for connection...');
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Automatic connection failed';
        setAutoStatus('error');
        setAutoMessage(message);
      }
    };

    void autoConnect();

    return () => {
      cancelled = true;
      autoActiveRef.current = false;
    };
  }, [connectWithOffer, isConnected, setLastOffer, signallingUrlParam]);

  useEffect(() => {
    if (isConnected) {
      const params = new URLSearchParams();
      if (signallingUrlParam) {
        params.set('signalling_url', signallingUrlParam);
      }
      if (clientOnlyParam) {
        params.set('clientonly', 'true');
      }
      if (isAdmin && adminPasswordParam) {
        params.set('admin_password', adminPasswordParam);
      }
      navigate(`/client/${roleToPath(role)}/control${params.toString() ? `?${params.toString()}` : ''}`, {
        replace: true,
        state: {
          adminPassword: isAdmin ? adminPasswordParam : undefined,
        },
      });
    }
  }, [adminPasswordParam, clientOnlyParam, isAdmin, isConnected, navigate, role, signallingUrlParam]);

  useEffect(() => {
    if (!isConnected && connectionState === 'closed' && autoStatus === 'sent') {
      setAutoStatus('error');
      setAutoMessage('Connection closed before the data channel opened. Please try again.');
    }
  }, [autoStatus, connectionState, isConnected]);

  const disableManualConnect = useMemo(() => autoStatus === 'fetching' || autoStatus === 'sending', [autoStatus]);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={4}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
          <Typography variant="h4">{isAdmin ? 'Admin Client' : 'Normal Client'}</Typography>
          <Box flexGrow={1} />
          <Button
            variant="text"
            onClick={() => {
              resetConnection();
              const target = isAdmin ? 'normal' : 'admin';
              const params = new URLSearchParams(location.search);
              params.delete('admin_password');
              navigate(`/client/${target}${params.toString() ? `?${params.toString()}` : ''}`);
            }}
          >
            Switch to {isAdmin ? 'Normal' : 'Admin'} Mode
          </Button>
        </Stack>

        {autoMessage && (
          <Alert
            severity={autoStatus === 'error' ? 'error' : 'info'}
            action=
              {autoStatus === 'error' ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    resetConnection();
                    navigateToLanding({ error: autoMessage ?? 'Automatic connection failed.' });
                  }}
                >
                  Adjust
                </Button>
              ) : undefined}
          >
            {autoMessage}
          </Alert>
        )}

        <Card variant="outlined">
          <CardHeader
            title="WebRTC Connection"
            subheader={
              signallingUrlParam
                ? 'Remote offer retrieved from signalling server automatically.'
                : 'Scan or paste the server offer JSON, then share the generated answer.'
            }
          />
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="stretch">
              <Stack spacing={2} flex={1}>
                <TextField
                  label="Offer SDP (JSON)"
                  multiline
                  minRows={6}
                  value={offerInput}
                  onChange={(event) => {
                    setOfferInput(event.target.value);
                    setLastOffer(event.target.value);
                    setScannerMessage(null);
                  }}
                  placeholder="Paste the offer JSON from the server"
                  disabled={disableManualConnect && !!signallingUrlParam}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button variant="contained" onClick={handleConnect} disabled={disableManualConnect}>
                    Connect
                  </Button>
                  <Button variant="outlined" onClick={handleDisconnect}>
                    Disconnect
                  </Button>
                </Stack>
                {offerError && <Alert severity="error">{offerError}</Alert>}
                <Typography variant="body2" color="text.secondary">
                  Connection: {connectionState} · Channel: {channelState}
                </Typography>
              </Stack>
              <Stack spacing={2} flex={1}>
                {enableScanner ? (
                  <>
                    <Box
                      sx={{
                        borderRadius: 2,
                        overflow: 'hidden',
                        bgcolor: 'grey.900',
                        color: 'common.white',
                        minHeight: 240,
                      }}
                    >
                      <Scanner
                        onScan={handleScannerScan}
                        onError={handleScannerError}
                        constraints={{ facingMode: 'environment' }}
                        styles={{ container: { width: '100%' }, video: { width: '100%' } }}
                      />
                    </Box>
                    {scannerMessage && <Alert severity="success">{scannerMessage}</Alert>}
                    {scannerError && <Alert severity="error">{scannerError}</Alert>}
                    <Typography variant="caption" color="text.secondary">
                      Point your device at the server QR offer to auto-fill the SDP JSON.
                    </Typography>
                  </>
                ) : (
                  <Alert severity="info">
                    QR scanning is available only over HTTPS or localhost. Paste the offer manually instead.
                  </Alert>
                )}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {answerOutput && !signallingUrlParam && (
          <Card variant="outlined">
            <CardHeader title="Answer SDP" subheader="Send this JSON back to the server to complete the handshake." />
            <CardContent>
              <Stack spacing={2}>
                <TextField label="Generated Answer" multiline minRows={6} value={answerOutput} />
                <Button variant="contained" onClick={handleCopyAnswer}>
                  Copy Answer
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}

        {signallingUrlParam && (
          <Alert severity="info">
            This client is using the signalling server at <strong>{signallingUrlParam}</strong>.
          </Alert>
        )}
      </Stack>
    </Container>
  );
};

export default ClientConnectPage;
