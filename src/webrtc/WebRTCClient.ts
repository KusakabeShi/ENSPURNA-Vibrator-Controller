import type { ClientMessage, ServerMessage, AppRole } from '../state/types';

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

type MessageHandler = (message: ServerMessage) => void;
type ConnectionStateHandler = (state: RTCPeerConnectionState) => void;

type ReadyStateHandler = (state: RTCDataChannelState) => void;

export class WebRTCClientManager {
  private declare connection?: RTCPeerConnection;
  private declare channel?: RTCDataChannel;
  private declare onMessage?: MessageHandler;
  private declare onConnectionState?: ConnectionStateHandler;
  private declare onReadyState?: ReadyStateHandler;
  private readonly role: AppRole;
  private readonly iceServers: RTCIceServer[];

  constructor(role: AppRole, iceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS) {
    this.role = role;
    this.iceServers = iceServers;
  }

  setMessageHandler(handler: MessageHandler) {
    this.onMessage = handler;
  }

  setConnectionStateHandler(handler: ConnectionStateHandler) {
    this.onConnectionState = handler;
  }

  setChannelStateHandler(handler: ReadyStateHandler) {
    this.onReadyState = handler;
  }

  async prepare(offerSdp: string): Promise<string> {
    this.connection?.close();

    const connection = new RTCPeerConnection({ iceServers: this.iceServers });
    this.connection = connection;

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      console.info('Client peer connection state change', state);
      this.onConnectionState?.(state);
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.channel?.close();
        this.channel = undefined;
      }
    };

    connection.ondatachannel = (event) => {
      this.channel = event.channel;
      this.channel.onmessage = (messageEvent) => {
        try {
          const data: ServerMessage = JSON.parse(messageEvent.data);
          this.onMessage?.(data);
        } catch (error) {
          console.error('Failed to parse server message', error);
        }
      };
      this.channel.onopen = () => {
        console.info('Client data channel opened');
        this.onReadyState?.(this.channel!.readyState);
        this.send({ type: 'hello', role: this.role });
      };
      this.channel.onclose = () => {
        console.info('Client data channel closed');
        this.onReadyState?.(this.channel?.readyState ?? 'closed');
      };
    };

    connection.oniceconnectionstatechange = () => {
      if (connection.iceConnectionState === 'failed') {
        connection.restartIce();
      }
    };

    const remoteDescription = JSON.parse(offerSdp) as RTCSessionDescriptionInit;
    await connection.setRemoteDescription(remoteDescription);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    await waitForIceGatheringComplete(connection);

    const localDescription = connection.localDescription;
    if (!localDescription) {
      throw new Error('Missing local description after gather');
    }

    return JSON.stringify(localDescription);
  }

  send(message: ClientMessage) {
    if (!this.channel || this.channel.readyState !== 'open') {
      return;
    }
    this.channel.send(JSON.stringify(message));
  }

  close() {
    this.channel?.close();
    this.connection?.close();
    this.channel = undefined;
    this.connection = undefined;
  }
}
