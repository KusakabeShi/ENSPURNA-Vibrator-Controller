import type { StageKey } from '../constants/stages';

export type AppRole = 'server' | 'client-normal' | 'client-admin';

export interface ServerSettings {
  apiEndpoint: string;
  apiKey: string;
  compatibleMode: boolean;
  compatibleDelaySeconds: number;
  signallingBaseUrl: string;
}

export interface StageParameterValues {
  [parameterKey: string]: string;
}

export type StageParameters = Record<StageKey, StageParameterValues>;

export type ServerLifecycleStatus = 'wait_init' | 'running' | 'stopped';

export interface SharedServerState {
  status: ServerLifecycleStatus;
  currentStage: StageKey;
  stageStartedAt: number; // epoch ms
  stageElapsedSeconds: number;
  stageRemainingSeconds: number;
  stageDurationSeconds: number;
  loopIteration: number;
  lightOn: boolean;
  allowContinue: boolean;
  stageParameters: StageParameters;
  adminPassword: string;
}

export interface ServerPersistentState {
  settings: ServerSettings;
  stageParameters: StageParameters;
  adminPassword: string;
}

export interface BaseClientAction {
  password?: string;
}

export type ClientActionRequest =
  | ({ type: 'request-stage-change'; stage: StageKey } & BaseClientAction)
  | ({ type: 'request-continue' } & BaseClientAction)
  | ({ type: 'request-start' } & BaseClientAction);

export type ServerMessage =
  | { type: 'state-update'; payload: SharedServerState }
  | { type: 'control-response'; success: boolean; message?: string };

export type ClientMessage =
  | { type: 'client-action'; payload: ClientActionRequest }
  | { type: 'hello'; role: AppRole };
