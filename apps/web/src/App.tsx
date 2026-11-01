import { API_PATHS, type AuthProvidersResponse, type User } from "@c2r/shared";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest, createApiClient } from "./api";
import { AuthenticatedApp } from "./AuthenticatedApp";
import { ErrorWithRetry } from "./ErrorWithRetry";
import { LoginScreen } from "./LoginScreen";

const LOGIN_ERROR_PARAM = "loginError";
const OIDC_ERROR_NOTICE = "Die Anmeldung beim Identity Provider ist fehlgeschlagen.";
const SESSION_EXPIRED_NOTICE = "Die Sitzung ist abgelaufen. Bitte erneut anmelden.";

type AuthState =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "anonymous"; notice: string | null }
  | { kind: "authenticated"; user: User };

function readInitialNotice(): string | null {
  const value = new URLSearchParams(window.location.search).get(LOGIN_ERROR_PARAM);
  return value === "oidc" ? OIDC_ERROR_NOTICE : null;
}

function removeLoginErrorFromUrl() {
  const url = new URL(window.location.href);
  if (url.searchParams.has(LOGIN_ERROR_PARAM)) {
    url.searchParams.delete(LOGIN_ERROR_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

async function loadCurrentUser(signal: AbortSignal): Promise<User | null> {
  try {
    return await apiRequest<User>(API_PATHS.me, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const [providers, setProviders] = useState<AuthProvidersResponse>({ oidc: null });
  const [attempt, setAttempt] = useState(0);
  const [initialNotice] = useState(readInitialNotice);

  useEffect(removeLoginErrorFromUrl, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      loadCurrentUser(signal),
      apiRequest<AuthProvidersResponse>(API_PATHS.authProviders, { signal }),
    ])
      .then(([user, loadedProviders]) => {
        setProviders(loadedProviders);
        setAuth(
          user ? { kind: "authenticated", user } : { kind: "anonymous", notice: initialNotice },
        );
      })
      .catch(() => {
        if (!signal.aborted) {
          setAuth({ kind: "failed" });
        }
      });
    return () => controller.abort();
  }, [attempt, initialNotice]);

  const refreshProviders = useCallback(() => {
    // On failure the last known providers stay in place; local login keeps working.
    apiRequest<AuthProvidersResponse>(API_PATHS.authProviders)
      .then(setProviders)
      .catch(() => undefined);
  }, []);

  const api = useMemo(
    () =>
      createApiClient(() => {
        // Late 401 responses must not replace the state after a regular logout.
        setAuth((current) =>
          current.kind === "authenticated"
            ? { kind: "anonymous", notice: SESSION_EXPIRED_NOTICE }
            : current,
        );
        refreshProviders();
      }),
    [refreshProviders],
  );

  if (auth.kind === "authenticated") {
    return (
      <AuthenticatedApp
        api={api}
        user={auth.user}
        onUserChange={(user) => setAuth({ kind: "authenticated", user })}
        onLoggedOut={() => {
          setAuth({ kind: "anonymous", notice: null });
          refreshProviders();
        }}
        onProvidersChange={refreshProviders}
      />
    );
  }

  if (auth.kind === "anonymous") {
    return (
      <LoginScreen
        providers={providers}
        notice={auth.notice}
        onLoggedIn={(user) => setAuth({ kind: "authenticated", user })}
      />
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Typography variant="h5" component="h1" gutterBottom>
        consumption2refill
      </Typography>
      {auth.kind === "loading" && <CircularProgress aria-label="Wird geladen" />}
      {auth.kind === "failed" && (
        <ErrorWithRetry
          message="Server nicht erreichbar."
          onRetry={() => {
            setAuth({ kind: "loading" });
            setAttempt((current) => current + 1);
          }}
        />
      )}
    </Container>
  );
}
