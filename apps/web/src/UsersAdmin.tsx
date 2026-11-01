import { API_PATHS, type User, adminUserPath } from "@c2r/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { ApiClient } from "./api";
import { ErrorWithRetry } from "./ErrorWithRetry";
import { FormDialog } from "./FormDialog";
import { PasswordDialog } from "./PasswordDialog";
import { UserCard } from "./UserCard";
import { UserFormDialog } from "./UserFormDialog";
import { useApiResource } from "./useApiResource";

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; user: User }
  | { kind: "password"; user: User }
  | { kind: "delete"; user: User };

interface UsersAdminProps {
  api: ApiClient;
  currentUser: User;
  onCurrentUserChange: (user: User) => void;
}

export function UsersAdmin({ api, currentUser, onCurrentUserChange }: UsersAdminProps) {
  const { state, reload, setData } = useApiResource<User[]>(api, API_PATHS.adminUsers);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (state.kind === "loading") {
    return <CircularProgress aria-label="Benutzer werden geladen" />;
  }
  if (state.kind === "failed") {
    return <ErrorWithRetry message={state.message} onRetry={reload} />;
  }
  const users = state.data;

  function finish(message: string) {
    setDialog(null);
    setNotice(message);
  }

  function handleSaved(saved: User) {
    const exists = users.some((user) => user.id === saved.id);
    setData(
      exists ? users.map((user) => (user.id === saved.id ? saved : user)) : [...users, saved],
    );
    if (saved.id === currentUser.id) {
      onCurrentUserChange(saved);
    }
    finish(exists ? "Benutzer gespeichert." : "Benutzer angelegt.");
  }

  async function handleDelete(user: User) {
    await api<void>(adminUserPath(user.id), { method: "DELETE" });
    setData(users.filter((other) => other.id !== user.id));
    finish("Benutzer gelöscht.");
  }

  function handlePasswordSaved(user: User) {
    finish("Passwort gesetzt.");
    if (user.id === currentUser.id) {
      // Setting a password ends the user's sessions. If that includes this one,
      // the resulting 401 leads back to the login screen.
      api<User>(API_PATHS.me).catch(() => undefined);
    }
  }

  return (
    <Stack spacing={2}>
      {notice && <Alert severity="success">{notice}</Alert>}
      <Button
        variant="contained"
        fullWidth
        onClick={() => {
          setNotice(null);
          setDialog({ kind: "create" });
        }}
      >
        Benutzer anlegen
      </Button>
      {users.length === 0 && <Typography>Keine Benutzer vorhanden.</Typography>}
      <Stack component="ul" spacing={2} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {users.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            isCurrentUser={user.id === currentUser.id}
            onEdit={() => {
              setNotice(null);
              setDialog({ kind: "edit", user });
            }}
            onSetPassword={() => {
              setNotice(null);
              setDialog({ kind: "password", user });
            }}
            onDelete={() => {
              setNotice(null);
              setDialog({ kind: "delete", user });
            }}
          />
        ))}
      </Stack>

      {dialog?.kind === "create" && (
        <UserFormDialog
          api={api}
          user={null}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      )}
      {dialog?.kind === "edit" && (
        <UserFormDialog
          api={api}
          user={dialog.user}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      )}
      {dialog?.kind === "password" && (
        <PasswordDialog
          api={api}
          user={dialog.user}
          onClose={() => setDialog(null)}
          onSaved={() => handlePasswordSaved(dialog.user)}
        />
      )}
      {dialog?.kind === "delete" && (
        <FormDialog
          title="Benutzer löschen"
          submitLabel="Löschen"
          submitColor="error"
          onClose={() => setDialog(null)}
          onSubmit={() => handleDelete(dialog.user)}
        >
          <Typography sx={{ overflowWrap: "anywhere" }}>
            Soll „{dialog.user.username}“ wirklich gelöscht werden?
          </Typography>
        </FormDialog>
      )}
    </Stack>
  );
}
