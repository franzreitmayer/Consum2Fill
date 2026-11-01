import { API_PATHS, type HelloResponse, type User } from "@c2r/shared";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ApiClient } from "./api";
import { ErrorWithRetry } from "./ErrorWithRetry";
import { useApiResource } from "./useApiResource";

interface HomeViewProps {
  api: ApiClient;
  user: User;
}

export function HomeView({ api, user }: HomeViewProps) {
  const { state, reload } = useApiResource<HelloResponse>(api, API_PATHS.hello);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        consumption2refill
      </Typography>
      {state.kind === "loading" && <CircularProgress aria-label="Wird geladen" />}
      {state.kind === "loaded" && <Typography>{state.data.message}</Typography>}
      {state.kind === "failed" && <ErrorWithRetry message={state.message} onRetry={reload} />}
      <Typography sx={{ overflowWrap: "anywhere" }}>
        Angemeldet als {user.displayName}, Rolle {user.role}
      </Typography>
    </Stack>
  );
}
