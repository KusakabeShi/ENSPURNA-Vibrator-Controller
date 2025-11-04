import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AppRole, ClientActionRequest, SharedServerState } from './types';
import type { StageKey } from '../constants/stages';
import { WebRTCClientManager } from '../webrtc/WebRTCClient';
import { loadClientLastOffer, saveClientLastOffer } from '../utils/storage';

interface ClientContextValue {
  role: AppRole;
  setRole: (role: AppRole) => void;
  sharedState: SharedServerState | null;
  connectionState: RTCPeerConnectionState;
  channelState: RTCDataChannelState;
  connectWithOffer: (offer: string) => Promise<string>;
  disconnect: () => void;
  sendStart: (password?: string) => void;
  sendContinue: (password?: string) => void;
  sendStageChange: (stage: StageKey, password?: string) => void;
  lastOffer: string;
  setLastOffer: (offer: string) => void;
  lastControlResponse: { success: boolean; message?: string } | null;
  clearControlResponse: () => void;
  setStoredPassword: (password: string) => void;
}

const ClientContext = createContext<ClientContextValue | undefined>(undefined);

export const ClientProvider: React.FC<{ children: React.ReactNode; initialRole: AppRole }> = ({
  children,
  initialRole,
}) => {
  const [role, setRole] = useState<AppRole>(initialRole);
  const [sharedState, setSharedState] = useState<SharedServerState | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [channelState, setChannelState] = useState<RTCDataChannelState>('closed');
  const [lastOffer, setLastOfferState] = useState<string>(() => loadClientLastOffer());
  const [lastControlResponse, setLastControlResponse] = useState<{ success: boolean; message?: string } | null>(null);

  const clientManagerRef = useRef<WebRTCClientManager | null>(null);
  const lastPasswordRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    clientManagerRef.current?.close();
    clientManagerRef.current = new WebRTCClientManager(role);
    const manager = clientManagerRef.current;
    if (!manager) {
      return () => undefined;
    }
    manager.setMessageHandler((message) => {
      if (message.type === 'state-update') {
        setSharedState(message.payload);
        return;
      }
      if (message.type === 'control-response') {
        setLastControlResponse({ success: message.success, message: message.message });
      }
    });
    manager.setConnectionStateHandler((state) => {
      setConnectionState(state);
    });
    manager.setChannelStateHandler((state) => {
      setChannelState(state);
    });

    return () => {
      manager.close();
    };
  }, [role]);

  useEffect(() => {
    setRole(initialRole);
  }, [initialRole]);

  const connectWithOffer = useCallback(async (offer: string) => {
    if (!offer.trim()) {
      throw new Error('Offer is empty. Paste the SDP offer first.');
    }
    saveClientLastOffer(offer);
    setLastOfferState(offer);
    const manager = clientManagerRef.current;
    if (!manager) {
      throw new Error('WebRTC client is not ready');
    }
    const answer = await manager.prepare(offer);
    return answer;
  }, []);

  const disconnect = useCallback(() => {
    clientManagerRef.current?.close();
    setChannelState('closed');
    setConnectionState('disconnected');
    setSharedState(null);
  }, []);

  const sendAction = useCallback((action: ClientActionRequest, password?: string) => {
    const manager = clientManagerRef.current;
    if (!manager) {
      return;
    }
    if (channelState !== 'open') {
      return;
    }
    const enriched: ClientActionRequest = {
      ...action,
      password: password ?? lastPasswordRef.current,
    };
    manager.send({ type: 'client-action', payload: enriched });
  }, [channelState]);

  const sendStart = useCallback(
    (password?: string) => {
      if (password) {
        lastPasswordRef.current = password;
      }
      sendAction({ type: 'request-start' }, password);
    },
    [sendAction],
  );

  const sendContinue = useCallback(
    (password?: string) => {
      if (password) {
        lastPasswordRef.current = password;
      }
      sendAction({ type: 'request-continue' }, password);
    },
    [sendAction],
  );

  const sendStageChange = useCallback(
    (stage: StageKey, password?: string) => {
      if (password) {
        lastPasswordRef.current = password;
      }
      sendAction({ type: 'request-stage-change', stage }, password);
    },
    [sendAction],
  );

  const setLastOffer = useCallback((offer: string) => {
    setLastOfferState(offer);
    saveClientLastOffer(offer);
  }, []);

  const clearControlResponse = useCallback(() => setLastControlResponse(null), []);

  const setStoredPassword = useCallback((password: string) => {
    lastPasswordRef.current = password;
  }, []);

  const value: ClientContextValue = {
    role,
    setRole,
    sharedState,
    connectionState,
    channelState,
    connectWithOffer,
    disconnect,
    sendStart,
    sendContinue,
    sendStageChange,
    lastOffer,
    setLastOffer,
    lastControlResponse,
    clearControlResponse,
    setStoredPassword,
  };

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
};

export const useClientContext = () => {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error('useClientContext must be used within ClientProvider');
  }
  return context;
};
