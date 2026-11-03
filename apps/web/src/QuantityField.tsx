import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { stepQuantity } from "./quantity";

interface QuantityFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Shown behind the number; empty shows nothing. */
  unit: string;
  disabled: boolean;
}

/** A quantity typed with comma or point, or changed by 1 with the buttons − and +. */
export function QuantityField({ value, onChange, unit, disabled }: QuantityFieldProps) {
  const decreased = stepQuantity(value, -1);
  const increased = stepQuantity(value, 1);

  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
      <StepButton
        label="Menge verringern"
        symbol="−"
        disabled={disabled || decreased === null}
        onClick={() => decreased !== null && onChange(decreased)}
      />
      <TextField
        label="Menge"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        sx={{ flex: 1, minWidth: 0 }}
        autoComplete="off"
        slotProps={{
          htmlInput: { inputMode: "decimal", enterKeyHint: "done", readOnly: disabled },
          input: {
            endAdornment: unit !== "" && (
              <InputAdornment
                position="end"
                // Long units wrap instead of being cut off or pushing the buttons out. Not
                // shrinking keeps short units in one piece, "anywhere" would allow any break.
                sx={{
                  flexShrink: 0,
                  height: "auto",
                  maxHeight: "none",
                  maxWidth: "50%",
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                }}
              >
                {unit}
              </InputAdornment>
            ),
          },
        }}
      />
      <StepButton
        label="Menge erhöhen"
        symbol="+"
        disabled={disabled || increased === null}
        onClick={() => increased !== null && onChange(increased)}
      />
    </Box>
  );
}

interface StepButtonProps {
  label: string;
  symbol: string;
  disabled: boolean;
  onClick: () => void;
}

function StepButton({ label, symbol, disabled, onClick }: StepButtonProps) {
  return (
    <Button
      variant="outlined"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      sx={{ flex: "none", minWidth: 56, minHeight: 56, px: 0, fontSize: "1.5rem" }}
    >
      {symbol}
    </Button>
  );
}
