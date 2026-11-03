import { API_PATHS, type Order, type User, orderDeliveredPath } from "@c2r/shared";
import Stack from "@mui/material/Stack";
import { ApiError, type ApiClient } from "./api";
import type { CaptureLookups } from "./captureLookups";
import { missingDataHint } from "./MissingDataHint";
import { MovementCard } from "./MovementCard";
import { type MovementBody, MovementFormDialog } from "./MovementFormDialog";
import {
  FilteredMovementList,
  LocationFilter,
  movementNames,
  useLocationFilter,
} from "./MovementList";
import { type ConfirmAction, RecordAdmin, type RecordAdminTexts } from "./RecordAdmin";

const TEXTS: RecordAdminTexts = {
  loading: "Bestellungen werden geladen",
  createButton: "Bestellung erfassen",
  empty: "Keine offenen Bestellungen.",
  deleteTitle: "Bestellung löschen",
  created: "Bestellung erfasst.",
  saved: "Bestellung gespeichert.",
  deleted: "Bestellung gelöscht.",
};

const TITLES = {
  create: "Bestellung erfassen",
  edit: (number: number) => `Bestellung Nr. ${number} bearbeiten`,
};

const UNKNOWN_PERSON = "unbekannt";

/**
 * Who asked for the order, grouped by person, e.g. "Erika Muster (Nr. 3, 5), Max (Nr. 4)". Null for
 * orders entered by hand and for orders from before this was recorded.
 */
export function requestedByText(order: Order): string | null {
  if (order.requestedBy.length === 0) return null;
  const groups = new Map<string, number[]>();
  for (const request of order.requestedBy) {
    const name = request.createdBy?.displayName ?? UNKNOWN_PERSON;
    groups.set(name, [...(groups.get(name) ?? []), request.number]);
  }
  return [...groups].map(([name, numbers]) => `${name} (Nr. ${numbers.join(", ")})`).join(", ");
}

interface OrdersAdminProps {
  api: ApiClient;
  user: User;
  lookups: CaptureLookups;
  /** False while hidden in a tab; becoming active again refreshes the list. */
  active?: boolean;
  /** A change loads the list again in the background. */
  reloadSignal?: number;
  onCurrentUserChange: (user: User) => void;
}

/** Only for ADMIN and MANAGER; the caller hides it from USER. */
export function OrdersAdmin({
  api,
  user,
  lookups,
  active,
  reloadSignal,
  onCurrentUserChange,
}: OrdersAdminProps) {
  const { locations, materials } = lookups;
  const { activeFilter, setFilterId } = useLocationFilter(locations);

  function orderLabel(order: Order): string {
    const { materialName } = movementNames(order, locations, materials);
    return `Bestellung Nr. ${order.number} (${materialName})`;
  }

  // Separate from deleting, so that the server can tell both apart later, e.g. for the stock.
  const deliveredAction: ConfirmAction<Order> = {
    title: "Lieferung bestätigen",
    submitLabel: "Geliefert",
    question: (order) =>
      `Ist „${orderLabel(order)}“ geliefert? Die Bestellung wird dann aus der Liste entfernt.`,
    request: (order) => ({ path: orderDeliveredPath(order.id), method: "POST" }),
    done: "Bestellung als geliefert entfernt.",
  };

  return (
    <Stack spacing={2}>
      <LocationFilter locations={locations} activeFilter={activeFilter} onChange={setFilterId} />
      <RecordAdmin<Order, MovementBody>
        api={api}
        path={API_PATHS.orders}
        texts={TEXTS}
        sortOrder="desc"
        recordLabel={orderLabel}
        active={active}
        reloadSignal={reloadSignal}
        createBlockedHint={missingDataHint(user, lookups)}
        onCurrentUserChange={onCurrentUserChange}
        renderList={(records, actions) => (
          <FilteredMovementList
            records={records}
            filter={activeFilter}
            nouns={{ one: "Bestellung", many: "Bestellungen" }}
            renderCard={(order) => {
              const requested = requestedByText(order);
              return (
                <MovementCard
                  key={order.id}
                  movement={order}
                  {...movementNames(order, locations, materials)}
                  details={[
                    `Bestellt von: ${order.createdBy?.displayName ?? UNKNOWN_PERSON}`,
                    ...(requested ? [`Angefordert von: ${requested}`] : []),
                  ]}
                  actions={[
                    { label: "Bearbeiten", onClick: () => actions.onEdit(order) },
                    { label: "Löschen", color: "error", onClick: () => actions.onDelete(order) },
                    {
                      label: "Geliefert",
                      onClick: () => actions.onConfirm(deliveredAction, order),
                    },
                  ]}
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
      />
    </Stack>
  );
}
