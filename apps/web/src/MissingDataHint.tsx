import type { User } from "@c2r/shared";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { CaptureLookups } from "./captureLookups";
import { ErrorWithRetry } from "./ErrorWithRetry";

function hintText(user: User, hasLocations: boolean): string {
  const solution =
    user.role === "USER"
      ? "Bitte an ADMIN oder MANAGER wenden."
      : "Bitte zuerst in den Stammdaten anlegen.";
  return `Zum Erfassen fehlt ${hasLocations ? "Material" : "mindestens ein Lagerort"}. ${solution}`;
}

/** Null when a new record can be filled in, otherwise the hint instead of the create button. */
export function missingDataHint(user: User, lookups: CaptureLookups) {
  const { locations, materials, check, runCheck } = lookups;
  if (locations.length > 0 && materials.length > 0) return undefined;

  return (
    <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
      <Alert severity="info" sx={{ width: "100%" }}>
        {hintText(user, locations.length > 0)}
      </Alert>
      {check.kind === "failed" ? (
        <ErrorWithRetry message={check.message} onRetry={runCheck} />
      ) : (
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          {/* A USER has no other view to come back from, which would load the lists. */}
          <Button variant="outlined" disabled={check.kind === "checking"} onClick={runCheck}>
            Neu laden
          </Button>
          {check.kind === "checking" && (
            <CircularProgress size={24} aria-label="Wird neu geladen" />
          )}
        </Stack>
      )}
      {check.kind === "checked" && (
        <Typography role="status" color="text.secondary">
          Neu geladen: Die Daten fehlen weiterhin.
        </Typography>
      )}
    </Stack>
  );
}
