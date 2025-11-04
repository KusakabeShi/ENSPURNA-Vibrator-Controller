export type StageKey =
  | 'prepare'
  | 'blanking_1'
  | 'blanking_2'
  | 'light_on'
  | 'rest';

export type StageActionType =
  | 'force-off'
  | 'force-on'
  | 'blanking'
  | 'range-on';

export interface StageParamDefinition {
  key: string;
  label: string;
  unit: 'minutes' | 'seconds';
  defaultValue: string;
  description?: string;
}

export interface StageDefinition {
  id: StageKey;
  name: string;
  action: StageActionType;
  cycle: 'initial' | 'loop';
  parameterDefs: StageParamDefinition[];
  color: string;
}

export const STAGES: StageDefinition[] = [
  {
    id: 'prepare',
    name: 'Prepare',
    action: 'force-off',
    cycle: 'initial',
    color: '#6c757d',
    parameterDefs: [
      {
        key: 'durationMinutes',
        label: 'Prepare Duration (minutes)',
        unit: 'minutes',
        defaultValue: '2',
        description: 'Format: mean or mean,offset (decimals allowed). Example: 2 or 2,0.5.',
      },
    ],
  },
  {
    id: 'blanking_1',
    name: 'Blanking 1',
    action: 'blanking',
    cycle: 'loop',
    color: '#17a2b8',
    parameterDefs: [
      {
        key: 'totalMinutes',
        label: 'Total Blanking Time (minutes)',
        unit: 'minutes',
        defaultValue: '10',
        description: 'Stage length (mean or mean,offset). Example: 10 or 10,2.',
      },
      {
        key: 'lightOnWait',
        label: 'Light On Wait (seconds)',
        unit: 'seconds',
        defaultValue: '3.8,2.8',
        description: 'Time the light stays on (mean or mean,offset).',
      },
      {
        key: 'lightOffWait',
        label: 'Light Off Wait (seconds)',
        unit: 'seconds',
        defaultValue: '2.2,1.2',
        description: 'Time the light stays off (mean or mean,offset).',
      },
    ],
  },
  {
    id: 'blanking_2',
    name: 'Blanking 2',
    action: 'blanking',
    cycle: 'loop',
    color: '#ffc107',
    parameterDefs: [
      {
        key: 'totalMinutes',
        label: 'Total Blanking Time (minutes)',
        unit: 'minutes',
        defaultValue: '10',
      },
      {
        key: 'lightOnWait',
        label: 'Light On Wait (seconds)',
        unit: 'seconds',
        defaultValue: '2.4,1.4',
      },
      {
        key: 'lightOffWait',
        label: 'Light Off Wait (seconds)',
        unit: 'seconds',
        defaultValue: '3.6,2.6',
      },
    ],
  },
  {
    id: 'light_on',
    name: 'Light On',
    action: 'range-on',
    cycle: 'loop',
    color: '#28a745',
    parameterDefs: [
      {
        key: 'minMinutes',
        label: 'Minimum Time (minutes)',
        unit: 'minutes',
        defaultValue: '2',
        description: 'Continue available after this time (mean or mean,offset).',
      },
      {
        key: 'maxMinutes',
        label: 'Maximum Time (minutes)',
        unit: 'minutes',
        defaultValue: '5',
        description: 'Auto advance after this time (mean or mean,offset).',
      },
    ],
  },
  {
    id: 'rest',
    name: 'Rest',
    action: 'force-off',
    cycle: 'loop',
    color: '#dc3545',
    parameterDefs: [
      {
        key: 'durationMinutes',
        label: 'Rest Time (minutes)',
        unit: 'minutes',
        defaultValue: '5',
      },
    ],
  },
];

export const STAGE_SEQUENCE: StageKey[] = STAGES.map((stage) => stage.id);
