import type {
  CreateMovementRequest,
  Material,
  Movement,
  StorageLocation,
  UpdateMovementRequest,
} from "@c2r/shared";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import { FormDialog } from "./FormDialog";
import { filterMaterials } from "./materialSearch";
import { formatQuantity, parseQuantity } from "./quantity";
import { QuantityField } from "./QuantityField";

export type MovementBody = CreateMovementRequest | UpdateMovementRequest;

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

export interface MovementDialogTitles {
  create: string;
  edit: (number: number) => string;
}

interface MovementFormDialogProps {
  /** The record to edit; null creates a new one. */
  record: Movement | null;
  titles: MovementDialogTitles;
  locations: StorageLocation[];
  materials: Material[];
  /** Preselected when creating, usually the location of the active filter. */
  initialLocationId: string;
  onClose: () => void;
  /** A thrown error is displayed in the dialog. */
  onSave: (body: MovementBody) => Promise<void>;
}

/** The dialog for consumptions and orders: location, material search and quantity. */
export function MovementFormDialog({
  record,
  titles,
  locations,
  materials,
  initialLocationId,
  onClose,
  onSave,
}: MovementFormDialogProps) {
  const initialQuantity = record ? formatQuantity(record.quantity) : "1";
  const [locationId, setLocationId] = useState(record?.storageLocationId ?? initialLocationId);
  const [material, setMaterial] = useState<Material | null>(() => {
    if (!record) return null;
    const { materialId } = record;
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
    record && !locations.some((other) => other.id === record.storageLocationId)
      ? record.storageLocationId
      : null;
  const selectedLocationId =
    locationId === missingOwnLocationId || locations.some((other) => other.id === locationId)
      ? locationId
      : "";

  /** An unchanged text is not checked: an older record may hold more decimals than allowed. */
  function readQuantity(): number {
    if (record && quantity === initialQuantity) return record.quantity;
    const parsed = parseQuantity(quantity);
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.value;
  }

  async function handleSubmit() {
    if (selectedLocationId === "") throw new Error("Bitte einen Lagerort wählen.");
    if (!material) throw new Error("Bitte ein Material wählen.");
    const value = readQuantity();

    const body: MovementBody = record
      ? {
          ...(selectedLocationId !== record.storageLocationId && {
            storageLocationId: selectedLocationId,
          }),
          ...(material.id !== record.materialId && { materialId: material.id }),
          ...(value !== record.quantity && { quantity: value }),
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
      title={record ? titles.edit(record.number) : titles.create}
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
      <QuantityField
        value={quantity}
        onChange={setQuantity}
        unit={material?.unit ?? ""}
        disabled={sending}
      />
    </FormDialog>
  );
}
