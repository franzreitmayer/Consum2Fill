import {
  type Consumption,
  type CreateOrderFromConsumptionsRequest,
  MAX_CONSUMPTIONS_PER_ORDER,
  type Material,
  type StorageLocation,
} from "@c2r/shared";
import Alert from "@mui/material/Alert";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { FormDialog } from "./FormDialog";
import { formatDate, quantityWithUnit } from "./MovementCard";
import { movementNames } from "./MovementList";
import { addQuantities, formatQuantity, parseQuantity } from "./quantity";
import { QuantityField } from "./QuantityField";

function byNumber(a: Consumption, b: Consumption): number {
  return a.number - b.number;
}

/**
 * The consumptions offered for the order: the chosen one and all others with its material and
 * location. Above the limit of the API, the chosen one stays and the oldest others fill up the rest,
 * as the oldest demand has waited longest. The newer ones remain for a further order.
 */
function offeredConsumptions(chosen: Consumption, consumptions: Consumption[]): Consumption[] {
  const matching = consumptions.filter(
    (other) =>
      other.materialId === chosen.materialId &&
      other.storageLocationId === chosen.storageLocationId,
  );
  const current = matching.find((other) => other.id === chosen.id);
  const others = matching.filter((other) => other.id !== chosen.id).sort(byNumber);
  const room = MAX_CONSUMPTIONS_PER_ORDER - (current ? 1 : 0);
  return [...(current ? [current] : []), ...others.slice(0, room)].sort(byNumber);
}

function sumOf(consumptions: Consumption[]): number {
  return consumptions.reduce((sum, consumption) => addQuantities(sum, consumption.quantity), 0);
}

interface OrderFromConsumptionsDialogProps {
  /** The consumption whose button opened the dialog; it sets material and location. */
  consumption: Consumption;
  /** All loaded consumptions, regardless of the filter, also after a refresh behind the dialog. */
  consumptions: Consumption[];
  locations: StorageLocation[];
  materials: Material[];
  onClose: () => void;
  /** A thrown error is displayed in the dialog. */
  onSave: (body: CreateOrderFromConsumptionsRequest) => Promise<void>;
}

export function OrderFromConsumptionsDialog({
  consumption,
  consumptions,
  locations,
  materials,
  onClose,
  onSave,
}: OrderFromConsumptionsDialogProps) {
  const { materialName, unit, locationName } = movementNames(consumption, locations, materials);
  const offered = offeredConsumptions(consumption, consumptions);
  // Unchecked ones are stored, not checked ones: a refresh behind the dialog may replace records
  // with newer versions, which should stay checked. Records that arrive later stay unchecked.
  const [initialIds] = useState(() => new Set(offered.map((other) => other.id)));
  const [uncheckedIds, setUncheckedIds] = useState<ReadonlySet<string>>(new Set());
  const [sending, setSending] = useState(false);

  const isChecked = (id: string) => initialIds.has(id) && !uncheckedIds.has(id);
  const checked = offered.filter((other) => isChecked(other.id));
  const sum = sumOf(checked);
  const sumText = formatQuantity(sum);

  // The quantity follows the sum whenever the choice or the records change; typing overrides it.
  const [quantity, setQuantity] = useState(sumText);
  const [sumSeen, setSumSeen] = useState(sum);
  if (sum !== sumSeen) {
    setSumSeen(sum);
    setQuantity(sumText);
  }

  const matchCount = consumptions.filter(
    (other) =>
      other.materialId === consumption.materialId &&
      other.storageLocationId === consumption.storageLocationId,
  ).length;

  function toggle(id: string) {
    setUncheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** The unchanged sum is not checked: older records may hold more decimals than allowed. */
  function readQuantity(): number {
    if (quantity === sumText) return sum;
    const parsed = parseQuantity(quantity);
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.value;
  }

  async function handleSubmit() {
    if (checked.length === 0) throw new Error("Bitte mindestens einen Verbrauch auswählen.");
    const value = readQuantity();
    setSending(true);
    try {
      await onSave({
        consumptions: checked.map(({ id, updatedAt }) => ({ id, updatedAt })),
        quantity: value,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <FormDialog
      title="Bestellung aus Verbrauch"
      submitLabel="Bestellen"
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <div>
        <Typography sx={{ overflowWrap: "anywhere" }}>Material: {materialName}</Typography>
        <Typography sx={{ overflowWrap: "anywhere" }}>Lagerort: {locationName}</Typography>
      </div>
      <FormControl component="fieldset" disabled={sending}>
        <FormLabel component="legend">Übernommene Verbräuche</FormLabel>
        {offered.length === 0 ? (
          <Alert severity="warning">
            Die Verbräuche gibt es nicht mehr. Bitte den Dialog schließen.
          </Alert>
        ) : (
          <FormGroup>
            {offered.map((other) => {
              const isOn = isChecked(other.id);
              const label = [
                `Nr. ${other.number}: ${quantityWithUnit(other.quantity, unit)}`,
                other.createdBy?.displayName ?? "unbekannt",
                formatDate(other.createdAt),
              ].join(", ");
              return (
                <FormControlLabel
                  key={other.id}
                  label={label}
                  // The whole row reacts to a tap, at least as high as a touch target.
                  sx={{ mx: 0, minHeight: 48, width: "100%", overflowWrap: "anywhere" }}
                  control={
                    <Checkbox
                      checked={isOn}
                      // At least one consumption stays checked.
                      disabled={isOn && checked.length === 1}
                      onChange={() => toggle(other.id)}
                    />
                  }
                />
              );
            })}
          </FormGroup>
        )}
      </FormControl>
      {matchCount > offered.length && (
        <Typography color="text.secondary">
          Höchstens {MAX_CONSUMPTIONS_PER_ORDER} Verbräuche je Bestellung: Angeboten sind der
          gewählte und die ältesten. {matchCount - offered.length} weitere bleiben für eine spätere
          Bestellung.
        </Typography>
      )}
      <QuantityField value={quantity} onChange={setQuantity} unit={unit} disabled={sending} />
    </FormDialog>
  );
}
