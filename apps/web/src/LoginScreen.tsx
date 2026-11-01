import { API_PATHS, type AuthProvidersResponse, type LoginRequest, type User } from "@c2r/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { type FormEvent, useState } from "react";
import { apiRequest, errorMessage } from "./api";

interface LoginScreenProps {
  providers: AuthProvidersResponse;
  notice: string | null;
  onLoggedIn: (user: User) => void;
}

export function LoginScreen({ providers, notice, onLoggedIn }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(notice);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const credentials: LoginRequest = { username: username.trim(), password };
      onLoggedIn(await apiRequest<User>(API_PATHS.login, { method: "POST", body: credentials }));
    } catch (error) {
      setMessage(errorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h1">
          consumption2refill
        </Typography>
        {message && <Alert severity="error">{message}</Alert>}
        <Stack component="form" spacing={2} onSubmit={handleSubmit}>
          <TextField
            label="Benutzername"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            fullWidth
            slotProps={{
              htmlInput: { autoCapitalize: "off", autoCorrect: "off", spellCheck: false },
            }}
          />
          <TextField
            label="Passwort"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            fullWidth
          />
          <Button type="submit" variant="contained" disabled={submitting} fullWidth>
            {submitting ? "Wird angemeldet …" : "Anmelden"}
          </Button>
        </Stack>
        {providers.oidc && (
          <>
            <Divider>oder</Divider>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => window.location.assign(API_PATHS.oidcLogin)}
            >
              Anmelden mit {providers.oidc.displayName}
            </Button>
          </>
        )}
      </Stack>
    </Container>
  );
}
