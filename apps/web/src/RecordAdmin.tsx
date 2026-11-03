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
}

type DialogState<T> =
  | { kind: "create" }
  | { kind: "edit"; record: T }
  | { kind: "confirm"; record: T; action: ConfirmAction<T> }
  | { kind: "custom"; record: T };

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

/** A request after a question, which removes the record, like deleting it. */
export interface ConfirmAction<T> {
  title: string;
  submitLabel: string;
  submitColor?: "primary" | "error";
  question: (record: T) => string;
  request: (record: T) => { path: string; method: "POST" | "DELETE" };
  /** The notice after success. */
  done: string;
}

export interface RecordActions<T> {
  onEdit: (record: T) => void;
  onDelete: (record: T) => void;
  onConfirm: (action: ConfirmAction<T>, record: T) => void;
  /** Opens the dialog of renderCustomDialog for the record. */
  onCustom: (record: T) => void;
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

/** What a custom request reports on success. */
export interface CustomResult {
  /** Records the request removed on the server; they leave the list at once. */
  removedIds: string[];
  message: string;
}

export interface CustomDialogContext<T> {
  /** The current list, also after a refresh behind the open dialog. */
  records: T[];
  onClose: () => void;
  /**
   * Runs a request like the other writes: a 403 closes the dialog and checks the own user. Other
   * errors are thrown for the dialog to display; a 404 or 409 also refreshes the list behind it.
   * On success the dialog closes with the message and the list is refreshed in the background.
   */
  submit: (request: () => Promise<CustomResult>) => Promise<void>;
}

interface RecordAdminProps<T extends AdminRecord, Body> {
  api: ApiClient;
  path: string;
  texts: RecordAdminTexts;
  /** Names the record in the question before deleting it. */
  recordLabel: (record: T) => string;
  /** By number; "desc" shows the newest records first. */
  sortOrder?: "asc" | "desc";
  /** Replaces the create button when a new record could not be filled in. */
  createBlockedHint?: ReactNode;
  /** False while hidden in a tab; becoming active again refreshes the list in the background. */
  active?: boolean;
  /** A change refreshes the list in the background; search, filter and notices stay. */
  reloadSignal?: number;
  onCurrentUserChange: (user: User) => void;
  /** Only called with at least one record. */
  renderList: (records: T[], actions: RecordActions<T>) => ReactNode;
  renderForm: (props: RecordFormProps<T, Body>) => ReactNode;
  /** The dialog opened with onCustom; without it, onCustom does nothing. */
  renderCustomDialog?: (record: T, context: CustomDialogContext<T>) => ReactNode;
}

/** The list element for the cards of a RecordAdmin. */
export function RecordList({ children }: { children: ReactNode }) {
  return (
    <Stack component="ul" spacing={2} sx={{ listStyle: "none", m: 0, p: 0 }}>
      {children}
    </Stack>
  );
}

/** Loads a list of records and runs the flows for creating, changing and deleting a record. */
export function RecordAdmin<T extends AdminRecord, Body>({
  api,
  path,
  texts,
  recordLabel,
  sortOrder = "asc",
  createBlockedHint,
  active = true,
  reloadSignal,
  onCurrentUserChange,
  renderList,
  renderForm,
  renderCustomDialog,
}: RecordAdminProps<T, Body>) {
  const { state, reload, refreshWithResult, updateData } = useApiResource<T[]>(api, path);
  const [dialog, setDialog] = useState<DialogState<T> | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const userRequest = useRef<AbortController | null>(null);
  const wasActive = useRef(active);
  const seenReloadSignal = useRef(reloadSignal);

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

  /** Refreshes in the background; a 403 also counts as a hint at a lost role. */
  function refreshList() {
    void refreshWithResult().then((result) => {
      if (result.kind === "failed" && result.status === 403) reloadCurrentUser();
    });
  }

  // An answer after leaving this view must not overwrite the session state, e.g. after a logout.
  useEffect(() => () => userRequest.current?.abort(), []);

  // A hidden panel stays mounted, so its list can be outdated when it is shown again.
  useEffect(() => {
    if (active && !wasActive.current && state.kind !== "loading") refreshList();
    wasActive.current = active;
    // Only showing the panel again starts this; the rest is read as of that moment.
  }, [active]);

  useEffect(() => {
    if (seenReloadSignal.current === reloadSignal) return;
    seenReloadSignal.current = reloadSignal;
    if (state.kind !== "loading") refreshList();
  }, [reloadSignal]);

  // Reading can be forbidden as well, e.g. the orders after losing the role.
  const forbiddenRead = state.kind === "failed" && state.status === 403;
  useEffect(() => {
    if (forbiddenRead) reloadCurrentUser();
  }, [forbiddenRead]);

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
  // Sorted here for the list from the server and for local changes alike.
  const direction = sortOrder === "asc" ? 1 : -1;
  const records = [...state.data].sort((a, b) => direction * (a.number - b.number));

  function recordPath(id: string): string {
    return `${path}/${encodeURIComponent(id)}`;
  }

  const deleteAction: ConfirmAction<T> = {
    title: texts.deleteTitle,
    submitLabel: "Löschen",
    submitColor: "error",
    question: (record) => `Soll „${recordLabel(record)}“ wirklich gelöscht werden?`,
    request: (record) => ({ path: recordPath(record.id), method: "DELETE" }),
    done: texts.deleted,
  };

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
   * Missing rights (403) cannot be fixed in the dialog, so it closes and the list is reloaded. The
   * same goes for a record that no longer exists (404), unless the dialog shows the 404 itself. All
   * other errors stay in the dialog. A 409 can also mean the list is outdated, e.g. after a lost
   * answer, so it is refreshed behind the dialog, like a 404 that stays in the dialog.
   */
  async function send(request: () => Promise<void>, notFoundInDialog = false) {
    try {
      await request();
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 403 || (error.status === 404 && !notFoundInDialog))
      ) {
        setDialog(null);
        setNotice({ severity: "error", message: error.message });
        reload();
        if (error.status === 403) reloadCurrentUser();
        return;
      }
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        refreshList();
      }
      throw error;
    }
  }

  function handleCreate(body: Body) {
    return send(async () => {
      const created = await api<T>(path, { method: "POST", body });
      // A refresh during the request may already have delivered the new record.
      updateData((current) => [...current.filter((other) => other.id !== created.id), created]);
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

  function handleConfirm(record: T, action: ConfirmAction<T>) {
    return send(async () => {
      const { path: target, method } = action.request(record);
      await api<void>(target, { method });
      updateData((current) => current.filter((other) => other.id !== record.id));
      finish(action.done);
    });
  }

  function handleCustom(request: () => Promise<CustomResult>) {
    return send(async () => {
      const { removedIds, message } = await request();
      updateData((current) => current.filter((other) => !removedIds.includes(other.id)));
      finish(message);
      // The request may have changed more on the server than the removed records.
      refreshList();
    }, true);
  }

  return (
    <Stack spacing={2}>
      {noticeAlert}
      {createBlockedHint ?? (
        <Button variant="contained" fullWidth onClick={() => openDialog({ kind: "create" })}>
          {texts.createButton}
        </Button>
      )}
      {records.length === 0 ? (
        <Typography>{texts.empty}</Typography>
      ) : (
        renderList(records, {
          onEdit: (record) => openDialog({ kind: "edit", record }),
          onDelete: (record) => openDialog({ kind: "confirm", record, action: deleteAction }),
          onConfirm: (action, record) => openDialog({ kind: "confirm", record, action }),
          onCustom: (record) => {
            if (renderCustomDialog) openDialog({ kind: "custom", record });
          },
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
      {dialog?.kind === "confirm" && (
        <FormDialog
          title={dialog.action.title}
          submitLabel={dialog.action.submitLabel}
          submitColor={dialog.action.submitColor}
          onClose={closeDialog}
          onSubmit={() => handleConfirm(dialog.record, dialog.action)}
        >
          <Typography sx={{ overflowWrap: "anywhere" }}>
            {dialog.action.question(dialog.record)}
          </Typography>
        </FormDialog>
      )}
      {dialog?.kind === "custom" &&
        renderCustomDialog?.(dialog.record, {
          records,
          onClose: closeDialog,
          submit: handleCustom,
        })}
    </Stack>
  );
}
