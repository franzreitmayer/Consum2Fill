import {
  API_PATHS,
  type CreateStorageLocationRequest,
  type StorageLocation,
  type UpdateStorageLocationRequest,
} from "@c2r/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { ApiError, type ApiClient } from "./api";
import { ErrorWithRetry } from "./ErrorWithRetry";
import { FormDialog } from "./FormDialog";
import { StorageLocationCard } from "./StorageLocationCard";
import { StorageLocationFormDialog } from "./StorageLocationFormDialog";
import { useApiResource } from "./useApiResource";

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; location: StorageLocation }
  | { kind: "delete"; location: StorageLocation };

interface Notice {
  severity: "success" | "error";
  message: string;
}

interface StorageLocationsAdminProps {
  api: ApiClient;
}

function storageLocationPath(id: string): string {
  return `${API_PATHS.storageLocations}/${encodeURIComponent(id)}`;
}

export function StorageLocationsAdmin({ api }: StorageLocationsAdminProps) {
  const { state, reload, setData } = useApiResource<StorageLocation[]>(
    api,
    API_PATHS.storageLocations,
  );
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const noticeAlert = notice && <Alert severity={notice.severity}>{notice.message}</Alert>;

  if (state.kind === "loading") {
    return (
      <Stack spacing={2}>
        {noticeAlert}
        <CircularProgress aria-label="Lagerorte werden geladen" />
      </Stack>
    );
  }
  if (state.kind === "failed") {
    return (
      <Stack spacing={2}>
        {notice?.message !== state.message && noticeAlert}
        <ErrorWithRetry
          message={state.message}
          onRetry={() => {
            setNotice(null);
            reload();
          }}
        />
      </Stack>
    );
  }
  const locations = state.data;

  function openDialog(next: DialogState) {
    setNotice(null);
    setDialog(next);
  }

  function finish(message: string) {
    setDialog(null);
    setNotice({ severity: "success", message });
  }

  /**
   * Missing rights (403) or a location that no longer exists (404) cannot be fixed in the dialog,
   * so it closes and the list is refreshed. All other errors stay in the dialog.
   */
  async function send(request: () => Promise<void>) {
    try {
      await request();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        setDialog(null);
        setNotice({ severity: "error", message: error.message });
        reload();
        return;
      }
      throw error;
    }
  }

  function handleCreate(name: string) {
    return send(async () => {
      const body: CreateStorageLocationRequest = { name };
      const created = await api<StorageLocation>(API_PATHS.storageLocations, {
        method: "POST",
        body,
      });
      setData([...locations, created]);
      finish("Lagerort angelegt.");
    });
  }

  function handleUpdate(location: StorageLocation, name: string) {
    return send(async () => {
      const body: UpdateStorageLocationRequest = { name };
      const updated = await api<StorageLocation>(storageLocationPath(location.id), {
        method: "PATCH",
        body,
      });
      setData(locations.map((other) => (other.id === updated.id ? updated : other)));
      finish("Lagerort gespeichert.");
    });
  }

  function handleDelete(location: StorageLocation) {
    return send(async () => {
      await api<void>(storageLocationPath(location.id), { method: "DELETE" });
      setData(locations.filter((other) => other.id !== location.id));
      finish("Lagerort gelöscht.");
    });
  }

  return (
    <Stack spacing={2}>
      {noticeAlert}
      <Button variant="contained" fullWidth onClick={() => openDialog({ kind: "create" })}>
        Lagerort anlegen
      </Button>
      {locations.length === 0 ? (
        <Typography>Keine Lagerorte vorhanden.</Typography>
      ) : (
        <Stack component="ul" spacing={2} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {locations.map((location) => (
            <StorageLocationCard
              key={location.id}
              location={location}
              onEdit={() => openDialog({ kind: "edit", location })}
              onDelete={() => openDialog({ kind: "delete", location })}
            />
          ))}
        </Stack>
      )}

      {dialog?.kind === "create" && (
        <StorageLocationFormDialog
          location={null}
          onClose={() => setDialog(null)}
          onSave={handleCreate}
        />
      )}
      {dialog?.kind === "edit" && (
        <StorageLocationFormDialog
          location={dialog.location}
          onClose={() => setDialog(null)}
          onSave={(name) => handleUpdate(dialog.location, name)}
        />
      )}
      {dialog?.kind === "delete" && (
        <FormDialog
          title="Lagerort löschen"
          submitLabel="Löschen"
          submitColor="error"
          onClose={() => setDialog(null)}
          onSubmit={() => handleDelete(dialog.location)}
        >
          <Typography sx={{ overflowWrap: "anywhere" }}>
            Soll „{dialog.location.name}“ wirklich gelöscht werden?
          </Typography>
        </FormDialog>
      )}
    </Stack>
  );
}
