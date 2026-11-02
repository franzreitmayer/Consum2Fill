import type {
  Consumption,
  CreateMovementRequest,
  Material,
  StorageLocation,
  UpdateMovementRequest,
} from "@c2r/shared";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import { FormDialog } from "./FormDialog";
import { filterMaterials } from "./materialSearch";
import { formatQuantity, parseQuantity, stepQuantity } from "./quantity";

export type ConsumptionBody = CreateMovementRequest | UpdateMovementRequest;

export const UNKNOWN_LOCATION = "Unbekannter Lagerort";
export const UNKNOWN_MATERIAL = "Unbekanntes Material";

/** Keeps a record usable whose material is not in the list: it stays selected and unchanged. */
function placeholderMaterial(id: string): Material {
  return {
    id,
    number: 0,
    name: UNKNOWN_MATERIAL,
    unit: "",
    description: "",
    tags: [],
    createdAt: "",
    updatedAt: "",
  };
}

interface ConsumptionFormDialogProps {
  /** The record to edit; null creates a new one. */
  consumption: Consumption | null;
  locations: StorageLocation[];
  materials: Material[];
  /** Preselected when creating, usually the location of the active filter. */
  initialLocationId: string;
  onClose: () => void;
  /** A thrown error is displayed in the dialog. */
  onSave: (body: ConsumptionBody) => Promise<void>;
}

export function ConsumptionFormDialog({
  consumption,
  locations,
  materials,
  initialLocationId,
  onClose,
  onSave,
}: ConsumptionFormDialogProps) {
  const initialQuantity = consumption ? formatQuantity(consumption.quantity) : "1";
  const [locationId, setLocationId] = useState(consumption?.storageLocationId ?? initialLocationId);
  const [material, setMaterial] = useState<Material | null>(() => {
    if (!consumption) return null;
    const { materialId } = consumption;
    return materials.find((other) => other.id === materialId) ?? placeholderMaterial(materialId);
  });
  const [quantity, setQuantity] = useState(initialQuantity);
  const [sending, setSending] = useState(false);

  // The lists can change behind the open dialog. A chosen material stays and the server decides;
  // a location that vanished is no valid choice for the select any more.
  const materialOptions =
    material && !materials.some((other) => other.id === material.id)
      ? [...materials, material]
      : materials;
  const missingOwnLocationId =
    consumption && !locations.some((other) => other.id === consumption.storageLocationId)
      ? consumption.storageLocationId
      : null;
  const selectedLocationId =
    locationId === missingOwnLocationId || locations.some((other) => other.id === locationId)
      ? locationId
      : "";

  const decreased = stepQuantity(quantity, -1);
  const increased = stepQuantity(quantity, 1);

  /** An unchanged text is not checked: an older record may hold more decimals than allowed. */
  function readQuantity(): number {
    if (consumption && quantity === initialQuantity) return consumption.quantity;
    const parsed = parseQuantity(quantity);
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.value;
  }

  async function handleSubmit() {
    if (selectedLocationId === "") throw new Error("Bitte einen Lagerort wählen.");
    if (!material) throw new Error("Bitte ein Material wählen.");
    const value = readQuantity();

    const body: ConsumptionBody = consumption
      ? {
          ...(selectedLocationId !== consumption.storageLocationId && {
            storageLocationId: selectedLocationId,
          }),
          ...(material.id !== consumption.materialId && { materialId: material.id }),
          ...(value !== consumption.quantity && { quantity: value }),
        }
      : { storageLocationId: selectedLocationId, materialId: material.id, quantity: value };
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    setSending(true);
    try {
      await onSave(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <FormDialog
      title={consumption ? `Verbrauch Nr. ${consumption.number} bearbeiten` : "Verbrauch erfassen"}
      submitLabel="Speichern"
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <TextField
        select
        label="Lagerort"
        value={selectedLocationId}
        onChange={(event) => setLocationId(event.target.value)}
        disabled={sending}
        fullWidth
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
      >
        {selectedLocationId === "" && <option value="">Bitte wählen</option>}
        {missingOwnLocationId && <option value={missingOwnLocationId}>{UNKNOWN_LOCATION}</option>}
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </TextField>
      <Autocomplete<Material, false, false, false>
        options={materialOptions}
        value={material}
        onChange={(_event, next) => setMaterial(next)}
        readOnly={sending}
        autoHighlight
        getOptionLabel={(option) => option.name}
        getOptionKey={(option) => option.id}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        filterOptions={(options, { inputValue }) => filterMaterials(options, inputValue)}
        noOptionsText="Kein Material gefunden"
        clearText="Auswahl löschen"
        openText="Liste öffnen"
        closeText="Liste schließen"
        renderOption={({ key, ...props }, option) => (
          <li key={key} {...props} style={{ overflowWrap: "anywhere" }}>
            {option.unit === "" ? option.name : `${option.name} (${option.unit})`}
          </li>
        )}
        slotProps={{ listbox: { sx: { "& .MuiAutocomplete-option": { minHeight: 48 } } } }}
        // The theme makes both icon buttons 48 px wide, which the default layout has no room for.
        sx={{
          "&&&&& .MuiOutlinedInput-root": { pr: "105px" },
          "& .MuiAutocomplete-endAdornment": { top: "50%", transform: "translateY(-50%)" },
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Material"
            // The field is narrow on a phone: variants of a long name differ at its end.
            helperText={material?.name ?? "Suche nach Name, Beschreibung oder Schlagwort"}
            slotProps={{
              ...params.slotProps,
              htmlInput: {
                ...params.slotProps.htmlInput,
                inputMode: "search",
                enterKeyHint: "search",
                autoCapitalize: "off",
              },
            }}
          />
        )}
      />
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <StepButton
          label="Menge verringern"
          symbol="−"
          disabled={sending || decreased === null}
          onClick={() => decreased !== null && setQuantity(decreased)}
        />
        <TextField
          label="Menge"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          sx={{ flex: 1, minWidth: 0 }}
          autoComplete="off"
          slotProps={{
            htmlInput: { inputMode: "decimal", enterKeyHint: "done", readOnly: sending },
            input: {
              endAdornment: material && material.unit !== "" && (
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
                  {material.unit}
                </InputAdornment>
              ),
            },
          }}
        />
        <StepButton
          label="Menge erhöhen"
          symbol="+"
          disabled={sending || increased === null}
          onClick={() => increased !== null && setQuantity(increased)}
        />
      </Box>
    </FormDialog>
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
