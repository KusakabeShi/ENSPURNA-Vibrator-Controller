import { Button, Stack } from '@mui/material';
import { STAGES } from '../constants/stages';
import type { StageKey } from '../constants/stages';

interface StageTimelineProps {
  currentStage: StageKey;
  onSelect: (stage: StageKey) => void;
  disabled?: boolean;
}

const StageTimeline = ({ currentStage, onSelect, disabled }: StageTimelineProps) => {
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap">
      {STAGES.map((stage) => (
        <Button
          key={stage.id}
          variant={stage.id === currentStage ? 'contained' : 'outlined'}
          onClick={() => onSelect(stage.id)}
          disabled={disabled}
          sx={{
            borderColor: stage.color,
            color: stage.id === currentStage ? 'common.white' : stage.color,
            backgroundColor: stage.id === currentStage ? stage.color : 'transparent',
            '&:hover': {
              borderColor: stage.color,
              backgroundColor: stage.id === currentStage ? stage.color : `${stage.color}22`,
            },
          }}
        >
          {stage.name}
        </Button>
      ))}
    </Stack>
  );
};

export default StageTimeline;
