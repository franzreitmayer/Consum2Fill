import {
  API_PATHS,
  type ChangeOwnPasswordRequest,
  MIN_PASSWORD_LENGTH,
  type User,
} from "@c2r/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { type FormEvent, useState } from "react";
import { type ApiClient, errorMessage } from "./api";

interface ChangePasswordScreenProps {
  api: ApiClient;
  onPasswordChanged: (user: User) => void;
  onLoggedOut: () => void;
}

type PendingAction = "submit" | "logout";

function validate(newPassword: string, repeatedPassword: string): string | null {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  }
  if (newPassword !== repeatedPassword) {
    return "Die Wiederholung stimmt nicht mit dem neuen Passwort überein.";
  }
  return null;
}

export function ChangePasswordScreen({
  api,
  onPasswordChanged,
  onLoggedOut,
}: ChangePasswordScreenProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatedPassword, setRepeatedPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const locked = pending !== null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validationMessage = validate(newPassword, repeatedPassword);
    setMessage(validationMessage);
    if (validationMessage) {
      return;
    }
    setPending("submit");
    try {
      const body: ChangeOwnPasswordRequest = { currentPassword, newPassword };
      onPasswordChanged(await api<User>(API_PATHS.ownPassword, { method: "PUT", body }));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  async function handleLogout() {
    setPending("logout");
    setMessage(null);
    try {
      await api<void>(API_PATHS.logout, { method: "POST" });
      onLoggedOut();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h1">
          Passwort ändern
        </Typography>
        <Alert severity="info">
          Dieses Konto nutzt noch ein Startpasswort, das nicht geheim ist. Bitte zuerst ein eigenes
          Passwort vergeben, danach steht die Anwendung zur Verfügung.
        </Alert>
        {message && <Alert severity="error">{message}</Alert>}
        <Stack component="form" spacing={2} onSubmit={handleSubmit}>
          <TextField
            label="Aktuelles Passwort"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
            fullWidth
            disabled={locked}
          />
          <TextField
            label="Neues Passwort"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
            fullWidth
            disabled={locked}
            helperText={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen, anders als das aktuelle Passwort`}
          />
          <TextField
            label="Neues Passwort wiederholen"
            type="password"
            value={repeatedPassword}
            onChange={(event) => setRepeatedPassword(event.target.value)}
            autoComplete="new-password"
            required
            fullWidth
            disabled={locked}
          />
          <Button type="submit" variant="contained" disabled={locked} fullWidth>
            {pending === "submit" ? "Wird geändert …" : "Passwort ändern"}
          </Button>
        </Stack>
        <Button variant="outlined" onClick={handleLogout} disabled={locked} fullWidth>
          {pending === "logout" ? "Wird abgemeldet …" : "Abmelden"}
        </Button>
      </Stack>
    </Container>
  );
}
