import { API_PATHS, type OidcSettings, type UpdateOidcSettingsRequest } from "@c2r/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { type FormEvent, useState } from "react";
import { type ApiClient, errorMessage } from "./api";
import { ErrorWithRetry } from "./ErrorWithRetry";
import { useApiResource } from "./useApiResource";

interface OidcSettingsFormProps {
  api: ApiClient;
  onSaved: () => void;
}

export function OidcSettingsForm({ api, onSaved }: OidcSettingsFormProps) {
  const { state, reload } = useApiResource<OidcSettings>(api, API_PATHS.adminOidcSettings);

  if (state.kind === "loading") {
    return <CircularProgress aria-label="OIDC-Einstellungen werden geladen" />;
  }
  if (state.kind === "failed") {
    return <ErrorWithRetry message={state.message} onRetry={reload} />;
  }
  return <OidcSettingsFields api={api} initial={state.data} onSaved={onSaved} />;
}

interface OidcSettingsFieldsProps extends OidcSettingsFormProps {
  initial: OidcSettings;
}

type Feedback = { severity: "success" | "error"; message: string };

function OidcSettingsFields({ api, initial, onSaved }: OidcSettingsFieldsProps) {
  const [settings, setSettings] = useState(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [issuerUrl, setIssuerUrl] = useState(initial.issuerUrl);
  const [clientId, setClientId] = useState(initial.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const body: UpdateOidcSettingsRequest = {
      enabled,
      displayName: displayName.trim(),
      issuerUrl: issuerUrl.trim(),
      clientId: clientId.trim(),
      ...(clientSecret === "" ? {} : { clientSecret }),
    };
    try {
      const saved = await api<OidcSettings>(API_PATHS.adminOidcSettings, { method: "PUT", body });
      setSettings(saved);
      setClientSecret("");
      setFeedback({ severity: "success", message: "Einstellungen gespeichert." });
      onSaved();
    } catch (error) {
      setFeedback({ severity: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    try {
      // navigator.clipboard is missing outside secure contexts, e.g. plain HTTP on a phone.
      await navigator.clipboard.writeText(settings.redirectUri);
      setCopyMessage("Kopiert.");
    } catch {
      setCopyMessage("Kopieren nicht möglich. Bitte den Text von Hand markieren.");
    }
  }

  return (
    <Stack component="form" spacing={2} onSubmit={handleSubmit}>
      <FormControlLabel
        label="Aktiviert"
        sx={{ minHeight: 48 }}
        control={
          <Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        }
      />
      <TextField
        label="Anzeigename"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        required={enabled}
        fullWidth
        autoComplete="off"
      />
      <TextField
        label="Issuer-URL"
        type="url"
        value={issuerUrl}
        onChange={(event) => setIssuerUrl(event.target.value)}
        required={enabled}
        fullWidth
        autoComplete="off"
        slotProps={{ htmlInput: { inputMode: "url", autoCapitalize: "off" } }}
      />
      <TextField
        label="Client-ID"
        value={clientId}
        onChange={(event) => setClientId(event.target.value)}
        required={enabled}
        fullWidth
        autoComplete="off"
        slotProps={{ htmlInput: { autoCapitalize: "off", autoCorrect: "off", spellCheck: false } }}
      />
      <TextField
        label="Client-Secret"
        type="password"
        value={clientSecret}
        onChange={(event) => setClientSecret(event.target.value)}
        required={enabled && !settings.clientSecretSet}
        fullWidth
        // Keeps password managers from filling in the administrator's own password.
        autoComplete="new-password"
        helperText={
          settings.clientSecretSet
            ? "Ein Secret ist gespeichert. Leer lassen, um es zu behalten. Bei einer neuen Issuer-URL muss es neu eingegeben werden."
            : "Es ist noch kein Secret gespeichert."
        }
      />
      <TextField
        label="Redirect-URI"
        value={settings.redirectUri}
        multiline
        fullWidth
        helperText="Diese Adresse im Client in Keycloak als gültige Redirect-URI eintragen."
        slotProps={{ htmlInput: { readOnly: true } }}
      />
      <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
        <Button variant="outlined" onClick={handleCopy}>
          Redirect-URI kopieren
        </Button>
        {copyMessage && <Typography variant="body2">{copyMessage}</Typography>}
      </Stack>
      {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}
      <Button type="submit" variant="contained" disabled={saving} fullWidth>
        {saving ? "Wird gespeichert …" : "Speichern"}
      </Button>
    </Stack>
  );
}
