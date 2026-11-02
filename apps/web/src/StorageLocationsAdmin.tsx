import {
  API_PATHS,
  type CreateStorageLocationRequest,
  type StorageLocation,
  type UpdateStorageLocationRequest,
  type User,
} from "@c2r/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
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
  onCurrentUserChange: (user: User) => void;
}

function storageLocationPath(id: string): string {
  return `${API_PATHS.storageLocations}/${encodeURIComponent(id)}`;
}

export function StorageLocationsAdmin({ api, onCurrentUserChange }: StorageLocationsAdminProps) {
  const { state, reload, refresh, updateData } = useApiResource<StorageLocation[]>(
    api,
    API_PATHS.storageLocations,
  );
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const userRequest = useRef<AbortController | null>(null);

  // An answer after leaving this view must not overwrite the session state, e.g. after a logout.
  useEffect(() => () => userRequest.current?.abort(), []);

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

  /** A 403 may mean the own role was taken away; the new role then decides what stays visible. */
  function reloadCurrentUser() {
    userRequest.current?.abort();
    const controller = new AbortController();
    userRequest.current = controller;
    api<User>(API_PATHS.me, { signal: controller.signal })
      .then((user) => {
        if (!controller.signal.aborted) onCurrentUserChange(user);
      })
      // The message of the 403 stays visible, a 401 is handled by the client.
      .catch(() => undefined);
  }

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
   * so it closes and the list is reloaded. All other errors stay in the dialog. A 409 can also mean
   * the list is outdated, e.g. after a lost answer, so it is refreshed behind the dialog.
   */
  async function send(request: () => Promise<void>) {
    try {
      await request();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        setDialog(null);
        setNotice({ severity: "error", message: error.message });
        reload();
        if (error.status === 403) reloadCurrentUser();
        return;
      }
      if (error instanceof ApiError && error.status === 409) refresh();
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
      // A refresh during the request may already have delivered the new location.
      updateData((current) => [...current.filter((other) => other.id !== created.id), created]);
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
      updateData((current) => current.map((other) => (other.id === updated.id ? updated : other)));
      finish("Lagerort gespeichert.");
    });
  }

  function handleDelete(location: StorageLocation) {
    return send(async () => {
      await api<void>(storageLocationPath(location.id), { method: "DELETE" });
      updateData((current) => current.filter((other) => other.id !== location.id));
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
