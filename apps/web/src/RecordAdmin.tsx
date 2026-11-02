import { API_PATHS, type User } from "@c2r/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ApiError, type ApiClient } from "./api";
import { ErrorWithRetry } from "./ErrorWithRetry";
import { FormDialog } from "./FormDialog";
import { useApiResource } from "./useApiResource";

interface AdminRecord {
  id: string;
  number: number;
  name: string;
}

type DialogState<T> =
  { kind: "create" } | { kind: "edit"; record: T } | { kind: "delete"; record: T };

interface Notice {
  severity: "success" | "error";
  message: string;
}

export interface RecordAdminTexts {
  loading: string;
  createButton: string;
  empty: string;
  deleteTitle: string;
  created: string;
  saved: string;
  deleted: string;
}

export interface RecordActions<T> {
  onEdit: (record: T) => void;
  onDelete: (record: T) => void;
}

export interface RecordFormProps<T, Body> {
  /** The record to edit; null creates a new one. */
  record: T | null;
  /** The current list, also after a refresh behind the open dialog. */
  records: T[];
  onClose: () => void;
  /** A thrown error is displayed in the dialog. */
  onSave: (body: Body) => Promise<void>;
}

interface RecordAdminProps<T extends AdminRecord, Body> {
  api: ApiClient;
  path: string;
  texts: RecordAdminTexts;
  /** False while hidden in a tab; becoming active again refreshes the list in the background. */
  active?: boolean;
  onCurrentUserChange: (user: User) => void;
  /** Only called with at least one record. */
  renderList: (records: T[], actions: RecordActions<T>) => ReactNode;
  renderForm: (props: RecordFormProps<T, Body>) => ReactNode;
}

/** The list element for the cards of a RecordAdmin. */
export function RecordList({ children }: { children: ReactNode }) {
  return (
    <Stack component="ul" spacing={2} sx={{ listStyle: "none", m: 0, p: 0 }}>
      {children}
    </Stack>
  );
}

/** Loads a list of master data and runs the flows for creating, changing and deleting a record. */
export function RecordAdmin<T extends AdminRecord, Body>({
  api,
  path,
  texts,
  active = true,
  onCurrentUserChange,
  renderList,
  renderForm,
}: RecordAdminProps<T, Body>) {
  const { state, reload, refresh, updateData } = useApiResource<T[]>(api, path);
  const [dialog, setDialog] = useState<DialogState<T> | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const userRequest = useRef<AbortController | null>(null);
  const wasActive = useRef(active);

  // An answer after leaving this view must not overwrite the session state, e.g. after a logout.
  useEffect(() => () => userRequest.current?.abort(), []);

  // A hidden panel stays mounted, so its list can be outdated when it is shown again.
  useEffect(() => {
    if (active && !wasActive.current && state.kind !== "loading") refresh();
    wasActive.current = active;
  }, [active, state.kind, refresh]);

  const noticeAlert = notice && <Alert severity={notice.severity}>{notice.message}</Alert>;

  if (state.kind === "loading") {
    return (
      <Stack spacing={2}>
        {noticeAlert}
        <CircularProgress aria-label={texts.loading} />
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
  const records = state.data;

  function recordPath(id: string): string {
    return `${path}/${encodeURIComponent(id)}`;
  }

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

  function openDialog(next: DialogState<T>) {
    setNotice(null);
    setDialog(next);
  }

  function closeDialog() {
    setDialog(null);
  }

  function finish(message: string) {
    setDialog(null);
    setNotice({ severity: "success", message });
  }

  /**
   * Missing rights (403) or a record that no longer exists (404) cannot be fixed in the dialog,
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

  function handleCreate(body: Body) {
    return send(async () => {
      const created = await api<T>(path, { method: "POST", body });
      // A refresh during the request may already have delivered the new record.
      updateData((current) =>
        [...current.filter((other) => other.id !== created.id), created].sort(
          (a, b) => a.number - b.number,
        ),
      );
      finish(texts.created);
    });
  }

  function handleUpdate(record: T, body: Body) {
    return send(async () => {
      const updated = await api<T>(recordPath(record.id), { method: "PATCH", body });
      updateData((current) => current.map((other) => (other.id === updated.id ? updated : other)));
      finish(texts.saved);
    });
  }

  function handleDelete(record: T) {
    return send(async () => {
      await api<void>(recordPath(record.id), { method: "DELETE" });
      updateData((current) => current.filter((other) => other.id !== record.id));
      finish(texts.deleted);
    });
  }

  return (
    <Stack spacing={2}>
      {noticeAlert}
      <Button variant="contained" fullWidth onClick={() => openDialog({ kind: "create" })}>
        {texts.createButton}
      </Button>
      {records.length === 0 ? (
        <Typography>{texts.empty}</Typography>
      ) : (
        renderList(records, {
          onEdit: (record) => openDialog({ kind: "edit", record }),
          onDelete: (record) => openDialog({ kind: "delete", record }),
        })
      )}

      {dialog?.kind === "create" &&
        renderForm({ record: null, records, onClose: closeDialog, onSave: handleCreate })}
      {dialog?.kind === "edit" &&
        renderForm({
          record: dialog.record,
          records,
          onClose: closeDialog,
          onSave: (body) => handleUpdate(dialog.record, body),
        })}
      {dialog?.kind === "delete" && (
        <FormDialog
          title={texts.deleteTitle}
          submitLabel="Löschen"
          submitColor="error"
          onClose={closeDialog}
          onSubmit={() => handleDelete(dialog.record)}
        >
          <Typography sx={{ overflowWrap: "anywhere" }}>
            Soll „{dialog.record.name}“ wirklich gelöscht werden?
          </Typography>
        </FormDialog>
      )}
    </Stack>
  );
}
