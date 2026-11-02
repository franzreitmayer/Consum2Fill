import {
  API_PATHS,
  type CreateStorageLocationRequest,
  type StorageLocation,
  type UpdateStorageLocationRequest,
  type User,
} from "@c2r/shared";
import type { ApiClient } from "./api";
import { RecordAdmin, type RecordAdminTexts, RecordList } from "./RecordAdmin";
import { StorageLocationCard } from "./StorageLocationCard";
import { StorageLocationFormDialog } from "./StorageLocationFormDialog";

const TEXTS: RecordAdminTexts = {
  loading: "Lagerorte werden geladen",
  createButton: "Lagerort anlegen",
  empty: "Keine Lagerorte vorhanden.",
  deleteTitle: "Lagerort löschen",
  created: "Lagerort angelegt.",
  saved: "Lagerort gespeichert.",
  deleted: "Lagerort gelöscht.",
};

interface StorageLocationsAdminProps {
  api: ApiClient;
  active?: boolean;
  onCurrentUserChange: (user: User) => void;
}

export function StorageLocationsAdmin({
  api,
  active,
  onCurrentUserChange,
}: StorageLocationsAdminProps) {
  return (
    <RecordAdmin<StorageLocation, CreateStorageLocationRequest | UpdateStorageLocationRequest>
      api={api}
      path={API_PATHS.storageLocations}
      texts={TEXTS}
      active={active}
      onCurrentUserChange={onCurrentUserChange}
      renderList={(locations, { onEdit, onDelete }) => (
        <RecordList>
          {locations.map((location) => (
            <StorageLocationCard
              key={location.id}
              location={location}
              onEdit={() => onEdit(location)}
              onDelete={() => onDelete(location)}
            />
          ))}
        </RecordList>
      )}
      renderForm={({ record, onClose, onSave }) => (
        <StorageLocationFormDialog
          location={record}
          onClose={onClose}
          onSave={(name) => onSave({ name })}
        />
      )}
    />
  );
}
