import type { ClientMessage, ServerMessage, AppRole } from '../state/types';

export interface ServerPeer {
  id: string;
  connection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  role: AppRole;
  authenticated: boolean;
}

type MessageHandler = (peerId: string, message: ClientMessage) => void;
type ConnectionHandler = (peer: ServerPeer) => void;

type PendingOffer = {
  peer: ServerPeer;
  offerSdp: string;
};

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const waitForIceGatheringComplete = (pc: RTCPeerConnection) =>
  new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
    } else {
      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', checkState);
    }
  });

const generatePeerId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `peer-${Math.random().toString(36).slice(2, 10)}`;
};

export class WebRTCServerManager {
  private peers = new Map<string, ServerPeer>();
  private pendingOffers = new Map<string, PendingOffer>();
  private declare onMessage?: MessageHandler;
  private declare onPeerConnected?: ConnectionHandler;
  private declare onPeerDisconnected?: ConnectionHandler;
  private readonly iceServers: RTCIceServer[];

  constructor(iceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS) {
    this.iceServers = iceServers;
  }

  setMessageHandler(handler?: MessageHandler) {
    this.onMessage = handler;
  }

  setPeerConnectedHandler(handler?: ConnectionHandler) {
    this.onPeerConnected = handler;
  }

  setPeerDisconnectedHandler(handler?: ConnectionHandler) {
    this.onPeerDisconnected = handler;
  }

  async createOffer(): Promise<{ peerId: string; sdp: string }> {
    const peerId = generatePeerId();
    const connection = new RTCPeerConnection({ iceServers: this.iceServers });
    const channel = connection.createDataChannel('state');

    const serverPeer: ServerPeer = {
      id: peerId,
      connection,
      dataChannel: channel,
      role: 'client-normal',
      authenticated: false,
    };

    channel.onopen = () => {
      console.info('Data channel opened for peer', peerId);
      this.onPeerConnected?.(serverPeer);
    };

    channel.onclose = () => {
      console.info('Data channel closed for peer', peerId);
      this.onPeerDisconnected?.(serverPeer);
      this.cleanupPeer(peerId);
    };

    channel.onmessage = (event) => {
      try {
        const data: ClientMessage = JSON.parse(event.data);
        if (data.type === 'hello' && data.role) {
          serverPeer.role = data.role;
        }
        this.onMessage?.(peerId, data);
      } catch (error) {
        console.error('Failed to parse client message', error);
      }
    };

    connection.onconnectionstatechange = () => {
      console.info('Peer connection state change', peerId, connection.connectionState);
      if (connection.connectionState === 'disconnected' || connection.connectionState === 'failed') {
        this.onPeerDisconnected?.(serverPeer);
        this.cleanupPeer(peerId);
      }
    };

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await waitForIceGatheringComplete(connection);

    const localDescription = connection.localDescription;
    if (!localDescription) {
      throw new Error('Failed to generate local description');
    }

    this.pendingOffers.set(peerId, {
      peer: serverPeer,
      offerSdp: JSON.stringify(localDescription),
    });

    return {
      peerId,
      sdp: JSON.stringify(localDescription),
    };
  }

  async acceptAnswer(peerId: string, answerSdp: string) {
    const pending = this.pendingOffers.get(peerId);
    if (!pending) {
      throw new Error('Unknown or expired offer. Generate a new QR code and try again.');
    }

    const { peer } = pending;
    this.pendingOffers.delete(peerId);
    this.peers.set(peerId, peer);

    const description = JSON.parse(answerSdp) as RTCSessionDescriptionInit;
    await peer.connection.setRemoteDescription(description);
  }

  broadcast(message: ServerMessage) {
    const payload = JSON.stringify(message);
    this.peers.forEach(({ dataChannel }) => {
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(payload);
      }
    });
  }

  sendToPeer(peerId: string, message: ServerMessage) {
    const peer = this.peers.get(peerId);
    if (!peer?.dataChannel || peer.dataChannel.readyState !== 'open') {
      return;
    }
    peer.dataChannel.send(JSON.stringify(message));
  }

  closePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.dataChannel?.close();
      peer.connection.close();
      this.peers.delete(peerId);
    }
    this.pendingOffers.delete(peerId);
  }

  private cleanupPeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.close();
      this.peers.delete(peerId);
    }
    this.pendingOffers.delete(peerId);
  }

  listPeers(): ServerPeer[] {
    return Array.from(this.peers.values());
  }

  getPeer(peerId: string): ServerPeer | undefined {
    return this.peers.get(peerId);
  }
}
