import type { Material, Movement, StorageLocation } from "@c2r/shared";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { type ReactNode, useState } from "react";
import { UNKNOWN_LOCATION, UNKNOWN_MATERIAL } from "./MovementFormDialog";
import { RecordList } from "./RecordAdmin";

const ALL_LOCATIONS = "";

/** The chosen location, null for all. A location that vanished falls back to all locations. */
export function useLocationFilter(locations: StorageLocation[]) {
  const [filterId, setFilterId] = useState(ALL_LOCATIONS);
  // Derived, not stored, so that the fallback needs no effect.
  const activeFilter = locations.find((location) => location.id === filterId) ?? null;
  return { activeFilter, setFilterId };
}

interface LocationFilterProps {
  locations: StorageLocation[];
  activeFilter: StorageLocation | null;
  onChange: (locationId: string) => void;
}

export function LocationFilter({ locations, activeFilter, onChange }: LocationFilterProps) {
  if (locations.length === 0) return null;
  return (
    <TextField
      select
      label="Nach Lagerort filtern"
      value={activeFilter?.id ?? ALL_LOCATIONS}
      onChange={(event) => onChange(event.target.value)}
      fullWidth
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
    >
      <option value={ALL_LOCATIONS}>Alle Lagerorte</option>
      {locations.map((location) => (
        <option key={location.id} value={location.id}>
          {location.name}
        </option>
      ))}
    </TextField>
  );
}

/** Names for a material and a location, with placeholders for references missing from the lists. */
export function movementNames(
  movement: Movement,
  locations: StorageLocation[],
  materials: Material[],
) {
  const material = materials.find((other) => other.id === movement.materialId);
  const location = locations.find((other) => other.id === movement.storageLocationId);
  return {
    materialName: material?.name ?? UNKNOWN_MATERIAL,
    unit: material?.unit ?? "",
    locationName: location?.name ?? UNKNOWN_LOCATION,
  };
}

interface FilteredMovementListProps<T extends Movement> {
  records: T[];
  filter: StorageLocation | null;
  /** The record in singular and in the dative plural, as in "1 von 2 Verbräuchen". */
  nouns: { one: string; many: string };
  renderCard: (record: T) => ReactNode;
}

export function FilteredMovementList<T extends Movement>({
  records,
  filter,
  nouns,
  renderCard,
}: FilteredMovementListProps<T>) {
  const hits = filter
    ? records.filter((record) => record.storageLocationId === filter.id)
    : records;

  return (
    <Stack spacing={2}>
      {filter && (
        <Typography role="status" color="text.secondary">
          Filter aktiv: {hits.length} von {records.length}{" "}
          {records.length === 1 ? nouns.one : nouns.many}
        </Typography>
      )}
      {hits.length === 0 ? (
        <Typography sx={{ overflowWrap: "anywhere" }}>
          Keine Einträge für „{filter?.name}“.
        </Typography>
      ) : (
        <RecordList>{hits.map(renderCard)}</RecordList>
      )}
    </Stack>
  );
}
