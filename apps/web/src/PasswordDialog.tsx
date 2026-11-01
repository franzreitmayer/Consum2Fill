import {
  MIN_PASSWORD_LENGTH,
  type SetPasswordRequest,
  type User,
  adminUserPasswordPath,
} from "@c2r/shared";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import type { ApiClient } from "./api";
import { FormDialog } from "./FormDialog";

interface PasswordDialogProps {
  api: ApiClient;
  user: User;
  onClose: () => void;
  onSaved: () => void;
}

export function PasswordDialog({ api, user, onClose, onSaved }: PasswordDialogProps) {
  const [password, setPassword] = useState("");

  async function handleSubmit() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`);
    }
    const body: SetPasswordRequest = { password };
    await api<void>(adminUserPasswordPath(user.id), { method: "PUT", body });
    onSaved();
  }

  return (
    <FormDialog
      title={`Passwort setzen: ${user.username}`}
      submitLabel="Passwort setzen"
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <TextField
        label="Neues Passwort"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        fullWidth
        autoComplete="new-password"
        helperText={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
      />
    </FormDialog>
  );
}
