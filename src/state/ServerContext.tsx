import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { STAGE_SEQUENCE } from '../constants/stages';
import type { StageKey } from '../constants/stages';
import type {
  ClientActionRequest,
  SharedServerState,
  StageParameters,
  ServerLifecycleStatus,
  ServerSettings,
} from './types';
import {
  loadServerSettings,
  saveServerSettings,
  loadStageParameters,
  saveStageParameters,
  saveAdminPassword,
} from '../utils/storage';
import { DEFAULT_SERVER_SETTINGS } from '../utils/defaults';
import { WebRTCServerManager } from '../webrtc/WebRTCServer';
import type { ServerPeer } from '../webrtc/WebRTCServer';
import {
  sampleBlankingWaitSeconds,
  sampleLightOnThresholds,
  sampleStageDurationSeconds,
} from '../utils/stageHelpers';
import { triggerLight } from '../utils/lightControl';

interface ServerContextValue {
  settings: ServerSettings;
  updateSettings: (partial: Partial<ServerSettings>) => void;
  stageParameters: StageParameters;
  updateStageParameter: (stage: StageKey, paramKey: string, value: string) => void;
  sharedState: SharedServerState;
  enterInit: () => void;
  startSequence: () => void;
  goToStage: (stage: StageKey) => void;
  continueStage: () => void;
  generateOffer: () => Promise<{ peerId: string; sdp: string } | null>;
  acceptAnswer: (peerId: string, answerSdp: string) => Promise<void>;
  currentOffer: { peerId: string; sdp: string } | null;
  peers: ServerPeer[];
  signallingShareUrl: string | null;
  signallingError: string | null;
}

const ServerContext = createContext<ServerContextValue | undefined>(undefined);

const generateAdminPassword = () => Math.floor(Math.random() * 10000).toString().padStart(4, '0');
const generateRoomId = () => Math.random().toString(36).slice(2, 10);

const initialStageParameters = loadStageParameters();
const initialPassword = (() => {
  const password = generateAdminPassword();
  saveAdminPassword(password);
  return password;
})();

const buildInitialSharedState = (
  stageParameters: StageParameters,
  adminPassword: string,
): SharedServerState => ({
  status: 'wait_init',
  currentStage: 'prepare',
  stageStartedAt: Date.now(),
  stageElapsedSeconds: 0,
  stageRemainingSeconds: 0,
  stageDurationSeconds: 0,
  loopIteration: 0,
  lightOn: false,
  allowContinue: false,
  stageParameters,
  adminPassword,
});

const getNextStage = (current: StageKey): StageKey => {
  if (current === 'prepare') {
    return 'blanking_1';
  }
  if (current === 'rest') {
    return 'blanking_1';
  }
  const index = STAGE_SEQUENCE.indexOf(current);
  if (index === -1) {
    return 'prepare';
  }
  return STAGE_SEQUENCE[index + 1] ?? 'blanking_1';
};

const isBlankingStage = (stage: StageKey) => stage === 'blanking_1' || stage === 'blanking_2';

export const ServerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ServerSettings>(() => loadServerSettings() ?? DEFAULT_SERVER_SETTINGS);
  const [stageParameters, setStageParameters] = useState<StageParameters>(initialStageParameters);
  const [sharedState, setSharedState] = useState<SharedServerState>(() =>
    buildInitialSharedState(initialStageParameters, initialPassword),
  );
  const [currentOffer, setCurrentOffer] = useState<{ peerId: string; sdp: string } | null>(null);
  const [peers, setPeers] = useState<ServerPeer[]>([]);
  const [signallingShareUrl, setSignallingShareUrl] = useState<string | null>(null);
  const [signallingError, setSignallingError] = useState<string | null>(null);
  const [serverInitialized, setServerInitialized] = useState(false);

  const sharedStateRef = useRef<SharedServerState>(sharedState);
  const stageParametersRef = useRef<StageParameters>(stageParameters);
  const settingsRef = useRef<ServerSettings>(settings);
  const blankingStateRef = useRef<{ nextToggleAt: number; lightOn: boolean } | null>(null);
  const lightOnThresholdRef = useRef<{ minSeconds: number; maxSeconds: number } | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const answerPollRef = useRef<number | null>(null);
  const activeSignallingPeerRef = useRef<string | null>(null);
  const signallingRoomIdRef = useRef<string | null>(null);
  const currentOfferRef = useRef<{ peerId: string; sdp: string } | null>(null);
  const signallingRoomPathRef = useRef<string | null>(null);

  const serverManagerRef = useRef<WebRTCServerManager | null>(null);
  if (!serverManagerRef.current) {
    serverManagerRef.current = new WebRTCServerManager();
  }

  useEffect(() => {
    sharedStateRef.current = sharedState;
  }, [sharedState]);

  useEffect(() => {
    stageParametersRef.current = stageParameters;
  }, [stageParameters]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const stopAnswerPolling = useCallback(() => {
    if (answerPollRef.current) {
      window.clearInterval(answerPollRef.current);
      answerPollRef.current = null;
      console.info('Stopped signalling answer polling');
    }
  }, []);

  const acceptAnswerRef = useRef<(peerId: string, answerSdp: string) => Promise<void> | null>(null);

  const startAnswerPolling = useCallback(() => {
    if (answerPollRef.current) {
      return;
    }
    const baseRaw = settingsRef.current.signallingBaseUrl?.trim();
    const roomId = signallingRoomIdRef.current;
    if (!baseRaw || !roomId) {
      return;
    }
    const normalizedBase = baseRaw.replace(/\/$/, '');
    const answerUrl = `${normalizedBase}/${roomId}/answer`;

    const poll = async () => {
      const peerId = activeSignallingPeerRef.current;
      if (!peerId || !currentOfferRef.current) {
        return;
      }
      try {
        const response = await fetch(answerUrl, { method: 'DELETE' });
        if (response.status === 200) {
          const answer = (await response.text()).trim();
          if (answer) {
            try {
              await acceptAnswerRef.current?.(peerId, answer);
              activeSignallingPeerRef.current = null;
            } catch (error) {
              console.error('Failed to accept answer from signalling server', error);
            }
          }
        } else if (response.status === 204) {
          // No answer yet; nothing to do.
        }
      } catch (error) {
        console.error('Failed to poll signalling answer', error);
      }
    };

    void poll();

    answerPollRef.current = window.setInterval(poll, 3000);
    console.info('Started signalling answer polling');
  }, []);

  useEffect(() => {
    if (!settings.signallingBaseUrl.trim()) {
      stopAnswerPolling();
      signallingRoomIdRef.current = null;
      signallingRoomPathRef.current = null;
      activeSignallingPeerRef.current = null;
      setSignallingShareUrl(null);
      setSignallingError(null);
    }
  }, [settings.signallingBaseUrl, stopAnswerPolling]);

  useEffect(() => {
    currentOfferRef.current = currentOffer;
  }, [currentOffer]);

  const broadcastState = useCallback(
    (state: SharedServerState) => {
      serverManagerRef.current?.broadcast({ type: 'state-update', payload: state });
    },
    [],
  );

  useEffect(() => {
    broadcastState(sharedState);
  }, [sharedState, broadcastState]);

  const ensureLightState = useCallback(
    async (on: boolean) => {
      setSharedState((prev) => {
        if (prev.lightOn === on) {
          return prev;
        }
        return {
          ...prev,
          lightOn: on,
        };
      });

      const latestSettings = settingsRef.current;
      if (!latestSettings.apiEndpoint || !latestSettings.apiKey) {
        return;
      }
      await triggerLight(on, latestSettings);
    },
    [],
  );

  const publishOfferToSignalling = useCallback(
    async (peerId: string, offerJson: string) => {
      const baseRaw = settingsRef.current.signallingBaseUrl?.trim();
      if (!baseRaw) {
        setSignallingShareUrl(null);
        setSignallingError(null);
        stopAnswerPolling();
        return;
      }

      const normalizedBase = baseRaw.replace(/\/$/, '');
      if (!signallingRoomIdRef.current) {
        signallingRoomIdRef.current = generateRoomId();
      }
      const roomId = signallingRoomIdRef.current;
      const roomUrl = `${normalizedBase}/${roomId}`;
      const offerUrl = `${roomUrl}/offer`;

      const checkHealth = async () => {
        const prefixHealth = await fetch(`${normalizedBase}/health`);
        if (!prefixHealth.ok) {
          throw new Error(`Signalling health failed (${prefixHealth.status})`);
        }
        const roomHealth = await fetch(`${roomUrl}/health`);
        if (!roomHealth.ok) {
          throw new Error(`Room health failed (${roomHealth.status})`);
        }
      };

      try {
        await checkHealth();
        const response = await fetch(offerUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: offerJson,
        });
        if (!response.ok) {
          throw new Error(`Offer publish failed (${response.status})`);
        }
        activeSignallingPeerRef.current = peerId;
        signallingRoomPathRef.current = roomUrl;
        const shareBase = `${window.location.origin}?clientonly=true&signalling_url=${encodeURIComponent(roomUrl)}`;
        setSignallingShareUrl(shareBase);
        setSignallingError(null);
        startAnswerPolling();
      } catch (error) {
        console.error('Failed to publish offer to signalling server', error);
        setSignallingError(error instanceof Error ? error.message : 'Failed to publish offer');
        setSignallingShareUrl(null);
        stopAnswerPolling();
        signallingRoomIdRef.current = null;
        signallingRoomPathRef.current = null;
      }
    },
    [startAnswerPolling, stopAnswerPolling],
  );

  const enterInit = useCallback(() => {
    const password = generateAdminPassword();
    saveAdminPassword(password);
    stopAnswerPolling();
    signallingRoomIdRef.current = null;
    signallingRoomPathRef.current = null;
    activeSignallingPeerRef.current = null;
    setSignallingShareUrl(null);
    setSignallingError(null);
    currentOfferRef.current = null;
    setCurrentOffer(null);
    setServerInitialized(true);
    setSharedState({
      ...buildInitialSharedState(stageParametersRef.current, password),
      stageParameters: stageParametersRef.current,
    });
    blankingStateRef.current = null;
    lightOnThresholdRef.current = null;
  }, [stopAnswerPolling]);

  const startStage = useCallback(
    (stage: StageKey) => {
      const now = Date.now();
      const parameters = stageParametersRef.current;
      let totalSeconds = stage === 'light_on' ? 0 : sampleStageDurationSeconds(stage, parameters);

      if (stage === 'light_on') {
        const thresholds = sampleLightOnThresholds(parameters);
        lightOnThresholdRef.current = thresholds;
        totalSeconds = thresholds.maxSeconds;
      } else {
        lightOnThresholdRef.current = null;
      }

      setSharedState((prev) => {
        const shouldResetLoop = stage === 'prepare';
        const nextLoopIteration = (() => {
          if (stage === 'prepare') {
            return 0;
          }
          if (stage === 'blanking_1') {
            const prior = prev.loopIteration ?? 0;
            if (prev.currentStage === 'prepare' || prev.currentStage === 'rest' || prior === 0) {
              return prior + 1;
            }
          }
          return prev.loopIteration;
        })();

        return {
          ...prev,
          status: 'running' as ServerLifecycleStatus,
          currentStage: stage,
          stageStartedAt: now,
          stageElapsedSeconds: 0,
          stageRemainingSeconds: totalSeconds,
          stageDurationSeconds: totalSeconds,
          loopIteration: shouldResetLoop ? 0 : nextLoopIteration,
          allowContinue: false,
          lightOn: stage === 'prepare' || stage === 'rest' ? false : true,
          stageParameters: parameters,
        };
      });

      if (isBlankingStage(stage)) {
        blankingStateRef.current = {
          lightOn: true,
          nextToggleAt: now + sampleBlankingWaitSeconds(stage, parameters, true) * 1000,
        };
        void ensureLightState(true);
      } else {
        blankingStateRef.current = null;
        if (stage === 'light_on') {
          void ensureLightState(true);
        } else {
          void ensureLightState(false);
        }
      }
    },
    [ensureLightState],
  );

  const goToStage = useCallback(
    (stage: StageKey) => {
      startStage(stage);
    },
    [startStage],
  );

  const advanceToNextStage = useCallback(() => {
    const current = sharedStateRef.current.currentStage;
    const next = getNextStage(current);
    startStage(next);
  }, [startStage]);

  const continueStage = useCallback(() => {
    const state = sharedStateRef.current;
    if (state.currentStage !== 'light_on') {
      return;
    }
    if (!state.allowContinue) {
      return;
    }
    advanceToNextStage();
  }, [advanceToNextStage]);

  const startSequence = useCallback(() => {
    startStage('prepare');
  }, [startStage]);

  const generateOffer = useCallback(async () => {
    try {
      const offer = await serverManagerRef.current?.createOffer();
      if (offer) {
        setCurrentOffer(offer);
        currentOfferRef.current = offer;
        void publishOfferToSignalling(offer.peerId, offer.sdp);
        return offer;
      }
    } catch (error) {
      console.error('Failed to create offer', error);
    }
    return null;
  }, [publishOfferToSignalling]);

  const acceptAnswer = useCallback(async (peerId: string, answerSdp: string) => {
    if (!peerId || !answerSdp) {
      return;
    }
    const finalize = () => {
      setCurrentOffer(null);
      currentOfferRef.current = null;
      activeSignallingPeerRef.current = null;
      if (!settingsRef.current.signallingBaseUrl.trim()) {
        void generateOffer();
      }
    };
    try {
      await serverManagerRef.current?.acceptAnswer(peerId, answerSdp);
      console.info('Accepted answer from peer', peerId);
    } catch (error) {
      console.error('Failed to accept answer', error);
    } finally {
      finalize();
    }
  }, [generateOffer]);

  const updateSettingsHandler = useCallback((partial: Partial<ServerSettings>) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        ...partial,
      };
      saveServerSettings(next);
      return next;
    });
  }, []);

  const updateStageParameter = useCallback((stage: StageKey, paramKey: string, value: string) => {
    const sanitized = value.trim();
    setStageParameters((prev) => {
      const updated: StageParameters = {
        ...prev,
        [stage]: {
          ...prev[stage],
          [paramKey]: sanitized,
        },
      };
      saveStageParameters(updated);
      setSharedState((prevShared) => ({
        ...prevShared,
        stageParameters: updated,
      }));
      return updated;
    });
  }, []);

  const processTick = useCallback(() => {
    const state = sharedStateRef.current;
    if (state.status !== 'running') {
      return;
    }
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - state.stageStartedAt) / 1000);
    const totalSeconds = state.stageDurationSeconds;
    const remainingSeconds = Math.max(totalSeconds - elapsedSeconds, 0);
    let allowContinue = state.allowContinue;

    if (state.currentStage === 'light_on') {
      const thresholds = lightOnThresholdRef.current;
      if (thresholds) {
        if (!allowContinue && elapsedSeconds >= thresholds.minSeconds) {
          allowContinue = true;
        }
        if (elapsedSeconds >= thresholds.maxSeconds) {
          advanceToNextStage();
          return;
        }
      }
    }

    setSharedState((prev) => ({
      ...prev,
      stageElapsedSeconds: elapsedSeconds,
      stageRemainingSeconds: remainingSeconds,
      allowContinue,
    }));

    if (isBlankingStage(state.currentStage) && blankingStateRef.current) {
      const blankingState = blankingStateRef.current;
      if (now >= blankingState.nextToggleAt && remainingSeconds > 0) {
        const nextLightOn = !blankingState.lightOn;
        blankingState.lightOn = nextLightOn;
        const waitSeconds = sampleBlankingWaitSeconds(state.currentStage, stageParametersRef.current, nextLightOn);
        blankingState.nextToggleAt = now + waitSeconds * 1000;
        void ensureLightState(nextLightOn);
      }
    }

    if (remainingSeconds <= 0) {
      advanceToNextStage();
    }
  }, [advanceToNextStage, ensureLightState]);

  useEffect(() => {
    tickTimerRef.current = window.setInterval(() => {
      processTick();
    }, 1000);
    return () => {
      if (tickTimerRef.current) {
        window.clearInterval(tickTimerRef.current);
      }
    };
  }, [processTick]);

  const verifyAdminPeer = useCallback(
    (peer: ServerPeer | undefined, password?: string): boolean => {
      if (!peer) {
        return false;
      }
      if (peer.role !== 'client-admin') {
        return true;
      }
      if (peer.authenticated) {
        return true;
      }
      if (password && password === sharedStateRef.current.adminPassword) {
        peer.authenticated = true;
        serverManagerRef.current?.sendToPeer(peer.id, { success: true, type: 'control-response' });
        setPeers(serverManagerRef.current?.listPeers() ?? []);
        return true;
      }
      serverManagerRef.current?.sendToPeer(peer?.id, {
        type: 'control-response',
        success: false,
        message: 'Invalid admin password',
      });
      return false;
    },
    [],
  );

  const handleClientAction = useCallback(
    (peerId: string, action: ClientActionRequest) => {
      const manager = serverManagerRef.current;
      if (!manager) {
        return;
      }
      const peer = manager.getPeer(peerId);
      switch (action.type) {
        case 'request-start':
          if (sharedStateRef.current.status === 'wait_init') {
            startSequence();
          }
          break;
        case 'request-continue':
          continueStage();
          break;
        case 'request-stage-change':
          if (!verifyAdminPeer(peer, action.password)) {
            return;
          }
          goToStage(action.stage);
          break;
        default:
          break;
      }
    },
    [continueStage, goToStage, startSequence, verifyAdminPeer],
  );

  useEffect(() => {
    const manager = serverManagerRef.current;
    if (!manager) {
      return () => undefined;
    }
    manager.setMessageHandler((peerId, message) => {
      if (message.type === 'client-action') {
        const action = message.payload;
        handleClientAction(peerId, action);
      }
      if (message.type === 'hello') {
        const current = sharedStateRef.current;
        manager.sendToPeer(peerId, { type: 'state-update', payload: current });
        setPeers(manager.listPeers());
      }
    });
    manager.setPeerConnectedHandler((peer) => {
      setPeers(manager.listPeers());
      if (settingsRef.current.signallingBaseUrl.trim()) {
        console.info('Peer connected, preparing next offer', peer.id);
        void generateOffer();
      }
    });
    manager.setPeerDisconnectedHandler(() => {
      setPeers(manager.listPeers());
    });

    return () => {
      manager.setMessageHandler(undefined);
      manager.setPeerConnectedHandler(undefined);
      manager.setPeerDisconnectedHandler(undefined);
    };
  }, [generateOffer, handleClientAction]);

  useEffect(() => {
    if (serverInitialized && !currentOffer) {
      void generateOffer();
    }
  }, [serverInitialized, currentOffer, generateOffer]);

  useEffect(() => {
    acceptAnswerRef.current = acceptAnswer;
  }, [acceptAnswer]);

  useEffect(() => {
    return () => {
      stopAnswerPolling();
    };
  }, [stopAnswerPolling]);

  const value: ServerContextValue = {
    settings,
    updateSettings: updateSettingsHandler,
    stageParameters,
    updateStageParameter,
    sharedState,
    enterInit,
    startSequence,
    goToStage,
    continueStage,
    generateOffer,
    acceptAnswer,
    currentOffer,
    peers,
    signallingShareUrl,
    signallingError,
  };

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
};

export const useServerContext = (): ServerContextValue => {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error('useServerContext must be used within ServerProvider');
  }
  return context;
};
