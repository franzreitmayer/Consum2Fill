import type { Movement } from "@c2r/shared";
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

export function formatDate(timestamp: string): string {
  return DATE_FORMAT.format(new Date(timestamp));
}

/** The quantity with its unit; an unknown material has no unit. */
export function quantityWithUnit(quantity: number, unit: string): string {
  return `${formatQuantity(quantity)} ${unit}`.trim();
}

export interface CardAction {
  /** Also names the button for screen readers, together with the number of the record. */
  label: string;
  color?: "primary" | "error";
  onClick: () => void;
}

interface MovementCardProps {
  movement: Movement;
  materialName: string;
  /** Empty when the material is unknown. */
  unit: string;
  locationName: string;
  /** Lines below the date, e.g. who created the record. */
  details: string[];
  /** Only the allowed actions; without any, no buttons are shown. */
  actions: CardAction[];
}

/** A consumption or an order in a list. */
export function MovementCard({
  movement,
  materialName,
  unit,
  locationName,
  details,
  actions,
}: MovementCardProps) {
  const label = `Nr. ${movement.number}`;

  return (
    <Card variant="outlined" component="li">
      <CardContent>
        <Typography>{label}</Typography>
        <Typography variant="h6" component="h3" sx={{ overflowWrap: "anywhere" }}>
          {materialName}
        </Typography>
        <Typography sx={{ overflowWrap: "anywhere" }}>
          Menge: {quantityWithUnit(movement.quantity, unit)}
        </Typography>
        <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
          Lagerort: {locationName}
        </Typography>
        <Typography color="text.secondary">Datum: {formatDate(movement.createdAt)}</Typography>
        {details.map((detail) => (
          <Typography key={detail} color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
            {detail}
          </Typography>
        ))}
      </CardContent>
      {actions.length > 0 && (
        <CardActions sx={{ flexWrap: "wrap", gap: 1 }} disableSpacing>
          {actions.map((action) => (
            <Button
              key={action.label}
              color={action.color}
              onClick={action.onClick}
              aria-label={`${action.label}: ${label}`}
            >
              {action.label}
            </Button>
          ))}
        </CardActions>
      )}
    </Card>
  );
}
