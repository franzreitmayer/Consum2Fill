import {
  API_PATHS,
  type Consumption,
  type CreateOrderFromConsumptionsRequest,
  type Order,
  type User,
} from "@c2r/shared";
import Stack from "@mui/material/Stack";
import { ApiError, type ApiClient } from "./api";
import { type CaptureLookups, canManageOrders } from "./captureLookups";
import { missingDataHint } from "./MissingDataHint";
import { type CardAction, MovementCard } from "./MovementCard";
import { type MovementBody, MovementFormDialog } from "./MovementFormDialog";
import {
  FilteredMovementList,
  LocationFilter,
  movementNames,
  useLocationFilter,
} from "./MovementList";
import { OrderFromConsumptionsDialog } from "./OrderFromConsumptionsDialog";
import { type CustomResult, RecordAdmin, type RecordAdminTexts } from "./RecordAdmin";

const TEXTS: RecordAdminTexts = {
  loading: "Verbräuche werden geladen",
  createButton: "Verbrauch erfassen",
  empty: "Noch kein Verbrauch erfasst.",
  deleteTitle: "Verbrauch löschen",
  created: "Verbrauch erfasst.",
  saved: "Verbrauch gespeichert.",
  deleted: "Verbrauch gelöscht.",
};

const TITLES = {
  create: "Verbrauch erfassen",
  edit: (number: number) => `Verbrauch Nr. ${number} bearbeiten`,
};

const CHANGED_HINT =
  "Die Verbräuche haben sich inzwischen geändert. Die Liste wurde neu geladen, bitte die Auswahl prüfen.";

/** Same rule as the API: ADMIN and MANAGER change everything, USER only the own records. */
function canChange(user: User, consumption: Consumption): boolean {
  return user.role !== "USER" || consumption.createdBy?.id === user.id;
}

interface ConsumptionsAdminProps {
  api: ApiClient;
  user: User;
  lookups: CaptureLookups;
  /** False while hidden in a tab; becoming active again refreshes the list. */
  active?: boolean;
  /** A change loads the list again in the background. */
  reloadSignal?: number;
  onCurrentUserChange: (user: User) => void;
}

export function ConsumptionsAdmin({
  api,
  user,
  lookups,
  active,
  reloadSignal,
  onCurrentUserChange,
}: ConsumptionsAdminProps) {
  const { locations, materials } = lookups;
  const { activeFilter, setFilterId } = useLocationFilter(locations);
  const mayOrder = canManageOrders(user);

  function deleteLabel(consumption: Consumption): string {
    const { materialName } = movementNames(consumption, locations, materials);
    return `Verbrauch Nr. ${consumption.number} (${materialName})`;
  }

  async function createOrder(body: CreateOrderFromConsumptionsRequest): Promise<CustomResult> {
    let order: Order;
    try {
      order = await api<Order>(API_PATHS.ordersFromConsumptions, { method: "POST", body });
    } catch (error) {
      // Deleted (404) or changed (409) meanwhile: the refreshed list shows the current state.
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
        throw new ApiError(error.status, `${error.message} ${CHANGED_HINT}`);
      }
      throw error;
    }
    const count = body.consumptions.length;
    return {
      removedIds: body.consumptions.map(({ id }) => id),
      message: `Bestellung Nr. ${order.number} angelegt, ${count} ${count === 1 ? "Verbrauch" : "Verbräuche"} übernommen.`,
    };
  }

  return (
    <Stack spacing={2}>
      <LocationFilter locations={locations} activeFilter={activeFilter} onChange={setFilterId} />
      <RecordAdmin<Consumption, MovementBody>
        api={api}
        path={API_PATHS.consumptions}
        texts={TEXTS}
        sortOrder="desc"
        recordLabel={deleteLabel}
        active={active}
        reloadSignal={reloadSignal}
        createBlockedHint={missingDataHint(user, lookups)}
        onCurrentUserChange={onCurrentUserChange}
        renderList={(records, actions) => (
          <FilteredMovementList
            records={records}
            filter={activeFilter}
            nouns={{ one: "Verbrauch", many: "Verbräuchen" }}
            renderCard={(consumption) => {
              const cardActions: CardAction[] = [];
              if (canChange(user, consumption)) {
                cardActions.push(
                  { label: "Bearbeiten", onClick: () => actions.onEdit(consumption) },
                  {
                    label: "Löschen",
                    color: "error",
                    onClick: () => actions.onDelete(consumption),
                  },
                );
              }
              if (mayOrder) {
                cardActions.push({
                  label: "Bestellen",
                  onClick: () => actions.onCustom(consumption),
                });
              }
              return (
                <MovementCard
                  key={consumption.id}
                  movement={consumption}
                  {...movementNames(consumption, locations, materials)}
                  details={[`Erfasst von: ${consumption.createdBy?.displayName ?? "unbekannt"}`]}
                  actions={cardActions}
                />
              );
            }}
          />
        )}
        renderForm={({ record, onClose, onSave }) => (
          <MovementFormDialog
            record={record}
            titles={TITLES}
            locations={locations}
            materials={materials}
            initialLocationId={activeFilter?.id ?? ""}
            onClose={onClose}
            onSave={async (body) => {
              try {
                await onSave(body);
              } catch (error) {
                // Usually a reference that was deleted meanwhile: offer the current lists.
                if (error instanceof ApiError && error.status === 400) lookups.refresh();
                throw error;
              }
            }}
          />
        )}
        renderCustomDialog={
          mayOrder
            ? (consumption, { records, onClose, submit }) => (
                <OrderFromConsumptionsDialog
                  consumption={consumption}
                  consumptions={records}
                  locations={locations}
                  materials={materials}
                  onClose={onClose}
                  onSave={(body) => submit(() => createOrder(body))}
                />
              )
            : undefined
        }
      />
    </Stack>
  );
}
