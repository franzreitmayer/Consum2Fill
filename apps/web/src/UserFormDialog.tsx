import {
  API_PATHS,
  type CreateUserRequest,
  MIN_PASSWORD_LENGTH,
  ROLES,
  type Role,
  type UpdateUserRequest,
  type User,
  adminUserPath,
} from "@c2r/shared";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import type { ApiClient } from "./api";
import { FormDialog } from "./FormDialog";

interface UserFormDialogProps {
  api: ApiClient;
  /** The user to edit; null creates a new local user. */
  user: User | null;
  onClose: () => void;
  onSaved: (user: User) => void;
}

interface FormValues {
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
}

function buildUpdate(user: User, values: FormValues): UpdateUserRequest {
  const update: UpdateUserRequest = {};
  if (values.role !== user.role) update.role = values.role;
  // The server only accepts role changes for IAM users.
  if (user.source === "local") {
    if (values.username !== user.username) update.username = values.username;
    if (values.displayName !== user.displayName) update.displayName = values.displayName;
    if (values.email !== user.email) update.email = values.email;
  }
  return update;
}

export function UserFormDialog({ api, user, onClose, onSaved }: UserFormDialogProps) {
  const [username, setUsername] = useState(user?.username ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "USER");
  const [password, setPassword] = useState("");

  const isIam = user?.source === "oidc";

  async function createUser(values: FormValues) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`);
    }
    const body: CreateUserRequest = { ...values, password };
    onSaved(await api<User>(API_PATHS.adminUsers, { method: "POST", body }));
  }

  async function updateUser(existing: User, values: FormValues) {
    const body = buildUpdate(existing, values);
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    onSaved(await api<User>(adminUserPath(existing.id), { method: "PATCH", body }));
  }

  async function handleSubmit() {
    const values: FormValues = {
      username: username.trim(),
      displayName: displayName.trim(),
      email: email.trim() === "" ? null : email.trim(),
      role,
    };
    await (user ? updateUser(user, values) : createUser(values));
  }

  return (
    <FormDialog
      title={user ? "Benutzer bearbeiten" : "Benutzer anlegen"}
      submitLabel="Speichern"
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      {isIam && (
        <Alert severity="info">
          Dieser Benutzer stammt aus dem IAM. Nur die Rolle ist änderbar.
        </Alert>
      )}
      <TextField
        label="Benutzername"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        disabled={isIam}
        required
        fullWidth
        autoComplete="off"
        slotProps={{ htmlInput: { autoCapitalize: "off", autoCorrect: "off", spellCheck: false } }}
      />
      <TextField
        label="Name"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        disabled={isIam}
        required
        fullWidth
        autoComplete="off"
      />
      <TextField
        label="E-Mail"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={isIam}
        fullWidth
        autoComplete="off"
        slotProps={{ htmlInput: { inputMode: "email", autoCapitalize: "off" } }}
      />
      <TextField
        select
        label="Rolle"
        value={role}
        onChange={(event) => setRole(event.target.value as Role)}
        fullWidth
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
      >
        {ROLES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </TextField>
      {!user && (
        <TextField
          label="Passwort"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          fullWidth
          autoComplete="new-password"
          helperText={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
        />
      )}
    </FormDialog>
  );
}
