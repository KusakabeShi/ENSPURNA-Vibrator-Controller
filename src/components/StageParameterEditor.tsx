import { Box, Card, CardContent, CardHeader, TextField, Tooltip } from '@mui/material';
import type { StageDefinition } from '../constants/stages';

interface StageParameterEditorProps {
  stage: StageDefinition;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

const StageParameterEditor = ({ stage, values, onChange }: StageParameterEditorProps) => {
  return (
    <Card variant="outlined" sx={{ borderTop: `4px solid ${stage.color}` }}>
      <CardHeader title={stage.name} subheader={`Configure parameters for ${stage.name}.`} sx={{ pb: 0 }} />
      <CardContent>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          {stage.parameterDefs.map((param) => {
            const value = values?.[param.key] ?? param.defaultValue;
            const label = `${param.label}${param.unit === 'seconds' ? ' (s)' : ' (min)'}`;
            const field = (
              <TextField
                fullWidth
                type="text"
                label={label}
                value={value}
                inputProps={{ inputMode: 'decimal' }}
                onChange={(event) => onChange(param.key, event.target.value)}
                placeholder="Examples: 5.5 or 5.5,2.7"
              />
            );
            return param.description ? (
              <Tooltip key={param.key} title={param.description} placement="top-start">
                <Box>{field}</Box>
              </Tooltip>
            ) : (
              <Box key={param.key}>{field}</Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
};

export default StageParameterEditor;
