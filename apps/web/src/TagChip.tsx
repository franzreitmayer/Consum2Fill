import Chip, { type ChipProps } from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";

const CHIP_HEIGHT_PX = 40;

interface TagChipProps extends Omit<ChipProps, "label" | "deleteIcon" | "sx"> {
  tag: string;
}

/**
 * A tag that wraps long text instead of cutting it off. With onDelete, it has a removal button of
 * the full 48 px, which reaches beyond the chip of 40 px and fills the gap between the rows.
 */
export function TagChip({ tag, ...chipProps }: TagChipProps) {
  return (
    <Chip
      {...chipProps}
      label={tag}
      deleteIcon={
        chipProps.onDelete ? (
          <IconButton aria-label={`Schlagwort entfernen: ${tag}`}>×</IconButton>
        ) : undefined
      }
      sx={{
        height: "auto",
        minHeight: CHIP_HEIGHT_PX,
        maxWidth: "100%",
        "& .MuiChip-label": { whiteSpace: "normal", overflowWrap: "anywhere" },
        "& .MuiChip-deleteIcon": {
          flexShrink: 0,
          width: 48,
          height: 48,
          m: "-4px 0",
          fontSize: 22,
        },
      }}
    />
  );
}
