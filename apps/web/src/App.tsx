import { API_PATHS, type HelloResponse } from "@c2r/shared";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";

type State = { kind: "loading" } | { kind: "loaded"; message: string } | { kind: "failed" };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(API_PATHS.hello, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Unexpected status ${res.status}`);
        }
        const body = (await res.json()) as HelloResponse;
        setState({ kind: "loaded", message: body.message });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ kind: "failed" });
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Typography variant="h5" component="h1" gutterBottom>
        consumption2refill
      </Typography>
      {state.kind === "loading" && <CircularProgress aria-label="Wird geladen" />}
      {state.kind === "loaded" && <Typography>{state.message}</Typography>}
      {state.kind === "failed" && <Alert severity="error">Server nicht erreichbar.</Alert>}
    </Container>
  );
}
