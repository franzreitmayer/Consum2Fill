import {
  API_PATHS,
  type Consumption,
  type Material,
  type StorageLocation,
  type User,
} from "@c2r/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { ApiError, type ApiClient } from "./api";
import { ConsumptionCard } from "./ConsumptionCard";
import {
  type ConsumptionBody,
  ConsumptionFormDialog,
  UNKNOWN_LOCATION,
  UNKNOWN_MATERIAL,
} from "./ConsumptionFormDialog";
import { ErrorWithRetry } from "./ErrorWithRetry";
import { type RecordActions, RecordAdmin, type RecordAdminTexts, RecordList } from "./RecordAdmin";
import { useApiResource } from "./useApiResource";

const TEXTS: RecordAdminTexts = {
  loading: "Verbräuche werden geladen",
  createButton: "Verbrauch erfassen",
  empty: "Noch kein Verbrauch erfasst.",
  deleteTitle: "Verbrauch löschen",
  created: "Verbrauch erfasst.",
  saved: "Verbrauch gespeichert.",
  deleted: "Verbrauch gelöscht.",
};

const ALL_LOCATIONS = "";

/** Same rule as the API: ADMIN and MANAGER change everything, USER only the own records. */
function canChange(user: User, consumption: Consumption): boolean {
  return user.role !== "USER" || consumption.createdBy?.id === user.id;
}

function missingDataHint(user: User, hasLocations: boolean): string {
  const solution =
    user.role === "USER"
      ? "Bitte an ADMIN oder MANAGER wenden."
      : "Bitte zuerst in den Stammdaten anlegen.";
  return `Zum Erfassen fehlt ${hasLocations ? "Material" : "mindestens ein Lagerort"}. ${solution}`;
}

/** The visible outcome of loading the lists again on request. */
type LookupCheck =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "checked" }
  | { kind: "failed"; message: string };

interface ConsumptionsAdminProps {
  api: ApiClient;
  user: User;
  /** A change loads all lists again in the background. */
  reloadSignal?: number;
  onCurrentUserChange: (user: User) => void;
}

export function ConsumptionsAdmin({
  api,
  user,
  reloadSignal,
  onCurrentUserChange,
}: ConsumptionsAdminProps) {
  const locations = useApiResource<StorageLocation[]>(api, API_PATHS.storageLocations);
  const materials = useApiResource<Material[]>(api, API_PATHS.materials);
  const [filterId, setFilterId] = useState(ALL_LOCATIONS);
  const [lookupCheck, setLookupCheck] = useState<LookupCheck>({ kind: "idle" });
  const latestCheck = useRef(0);
  const seenReloadSignal = useRef(reloadSignal);

  /** Unlike refreshLookups, this reports the outcome for the hint about missing master data. */
  function checkLookups() {
    latestCheck.current += 1;
    const check = latestCheck.current;
    setLookupCheck({ kind: "checking" });
    void Promise.all([locations.refreshWithResult(), materials.refreshWithResult()]).then(
      (results) => {
        if (check !== latestCheck.current) return;
        const failed = results.find((result) => result.kind === "failed");
        if (failed) setLookupCheck(failed);
        else if (results.some((result) => result.kind === "cancelled")) {
          setLookupCheck({ kind: "idle" });
        } else setLookupCheck({ kind: "checked" });
      },
    );
  }

  useEffect(() => {
    if (seenReloadSignal.current === reloadSignal) return;
    seenReloadSignal.current = reloadSignal;
    if (locations.state.kind !== "loading" && materials.state.kind !== "loading") checkLookups();
    // Only the signal starts this; the rest is read as of that moment.
  }, [reloadSignal]);

  // Names, filter and dialog depend on both lists, and a failed list must not look like an empty
  // one. So the records only appear with both lists. A failed refresh later keeps the old lists.
  const failed = [locations.state, materials.state].find((state) => state.kind === "failed");
  if (failed) {
    return (
      <ErrorWithRetry
        message={failed.message}
        onRetry={() => {
          if (locations.state.kind === "failed") locations.reload();
          if (materials.state.kind === "failed") materials.reload();
        }}
      />
    );
  }
  if (locations.state.kind !== "loaded" || materials.state.kind !== "loaded") {
    return <CircularProgress aria-label="Lagerorte und Material werden geladen" />;
  }

  const locationList = locations.state.data;
  const materialList = materials.state.data;

  function refreshLookups() {
    locations.refresh();
    materials.refresh();
  }

  // Derived, not stored: a filtered location that vanished falls back to all locations.
  const activeFilter = locationList.find((location) => location.id === filterId) ?? null;
  const canCreate = locationList.length > 0 && materialList.length > 0;

  function deleteLabel(consumption: Consumption): string {
    const material = materialList.find((other) => other.id === consumption.materialId);
    return `Verbrauch Nr. ${consumption.number} (${material?.name ?? UNKNOWN_MATERIAL})`;
  }

  return (
    <Stack spacing={2}>
      {locationList.length > 0 && (
        <TextField
          select
          label="Nach Lagerort filtern"
          value={activeFilter?.id ?? ALL_LOCATIONS}
          onChange={(event) => setFilterId(event.target.value)}
          fullWidth
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
        >
          <option value={ALL_LOCATIONS}>Alle Lagerorte</option>
          {locationList.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </TextField>
      )}
      <RecordAdmin<Consumption, ConsumptionBody>
        api={api}
        path={API_PATHS.consumptions}
        texts={TEXTS}
        sortOrder="desc"
        recordLabel={deleteLabel}
        reloadSignal={reloadSignal}
        createBlockedHint={
          canCreate ? undefined : (
            <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
              <Alert severity="info" sx={{ width: "100%" }}>
                {missingDataHint(user, locationList.length > 0)}
              </Alert>
              {lookupCheck.kind === "failed" ? (
                <ErrorWithRetry message={lookupCheck.message} onRetry={checkLookups} />
              ) : (
                <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                  {/* A USER has no other view to come back from, which would load the lists. */}
                  <Button
                    variant="outlined"
                    disabled={lookupCheck.kind === "checking"}
                    onClick={checkLookups}
                  >
                    Neu laden
                  </Button>
                  {lookupCheck.kind === "checking" && (
                    <CircularProgress size={24} aria-label="Wird neu geladen" />
                  )}
                </Stack>
              )}
              {lookupCheck.kind === "checked" && (
                <Typography role="status" color="text.secondary">
                  Neu geladen: Die Daten fehlen weiterhin.
                </Typography>
              )}
            </Stack>
          )
        }
        onCurrentUserChange={onCurrentUserChange}
        renderList={(records, actions) => (
          <FilteredList
            records={records}
            actions={actions}
            filter={activeFilter}
            user={user}
            locations={locationList}
            materials={materialList}
          />
        )}
        renderForm={({ record, onClose, onSave }) => (
          <ConsumptionFormDialog
            consumption={record}
            locations={locationList}
            materials={materialList}
            initialLocationId={activeFilter?.id ?? ""}
            onClose={onClose}
            onSave={async (body) => {
              try {
                await onSave(body);
              } catch (error) {
                // Usually a reference that was deleted meanwhile: offer the current lists.
                if (error instanceof ApiError && error.status === 400) refreshLookups();
                throw error;
              }
            }}
          />
        )}
      />
    </Stack>
  );
}

interface FilteredListProps {
  records: Consumption[];
  actions: RecordActions<Consumption>;
  filter: StorageLocation | null;
  user: User;
  locations: StorageLocation[];
  materials: Material[];
}

function FilteredList({ records, actions, filter, user, locations, materials }: FilteredListProps) {
  const hits = filter
    ? records.filter((consumption) => consumption.storageLocationId === filter.id)
    : records;

  return (
    <Stack spacing={2}>
      {filter && (
        <Typography role="status" color="text.secondary">
          Filter aktiv: {hits.length} von {records.length}{" "}
          {records.length === 1 ? "Verbrauch" : "Verbräuchen"}
        </Typography>
      )}
      {hits.length === 0 ? (
        <Typography sx={{ overflowWrap: "anywhere" }}>
          Keine Einträge für „{filter?.name}“.
        </Typography>
      ) : (
        <RecordList>
          {hits.map((consumption) => {
            const material = materials.find((other) => other.id === consumption.materialId);
            const location = locations.find((other) => other.id === consumption.storageLocationId);
            return (
              <ConsumptionCard
                key={consumption.id}
                consumption={consumption}
                materialName={material?.name ?? UNKNOWN_MATERIAL}
                unit={material?.unit ?? ""}
                locationName={location?.name ?? UNKNOWN_LOCATION}
                actions={
                  canChange(user, consumption)
                    ? {
                        onEdit: () => actions.onEdit(consumption),
                        onDelete: () => actions.onDelete(consumption),
                      }
                    : null
                }
              />
            );
          })}
        </RecordList>
      )}
    </Stack>
  );
}
