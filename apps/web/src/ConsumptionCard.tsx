import type { Consumption } from "@c2r/shared";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import { formatQuantity } from "./quantity";

// Without a time zone option: the date as seen on this device.
const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

interface ConsumptionCardProps {
  consumption: Consumption;
  materialName: string;
  /** Empty when the material is unknown. */
  unit: string;
  locationName: string;
  /** Null without the right to change the record: the buttons are not shown at all. */
  actions: { onEdit: () => void; onDelete: () => void } | null;
}

export function ConsumptionCard({
  consumption,
  materialName,
  unit,
  locationName,
  actions,
}: ConsumptionCardProps) {
  const quantity = `${formatQuantity(consumption.quantity)} ${unit}`.trim();
  const label = `Nr. ${consumption.number}`;

  return (
    <Card variant="outlined" component="li">
      <CardContent>
        <Typography>{label}</Typography>
        <Typography variant="h6" component="h3" sx={{ overflowWrap: "anywhere" }}>
          {materialName}
        </Typography>
        <Typography sx={{ overflowWrap: "anywhere" }}>Menge: {quantity}</Typography>
        <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
          Lagerort: {locationName}
        </Typography>
        <Typography color="text.secondary">
          Datum: {DATE_FORMAT.format(new Date(consumption.createdAt))}
        </Typography>
        <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
          Erfasst von: {consumption.createdBy?.displayName ?? "unbekannt"}
        </Typography>
      </CardContent>
      {actions && (
        <CardActions sx={{ flexWrap: "wrap", gap: 1 }} disableSpacing>
          <Button onClick={actions.onEdit} aria-label={`Bearbeiten: ${label}`}>
            Bearbeiten
          </Button>
          <Button color="error" onClick={actions.onDelete} aria-label={`Löschen: ${label}`}>
            Löschen
          </Button>
        </CardActions>
      )}
    </Card>
  );
}
