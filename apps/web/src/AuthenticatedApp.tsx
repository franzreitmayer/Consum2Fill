import { API_PATHS, type User } from "@c2r/shared";
import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { AdminArea } from "./AdminArea";
import { type ApiClient, apiRequest, errorMessage } from "./api";
import { HomeView } from "./HomeView";

type View = "home" | "admin";

interface AuthenticatedAppProps {
  api: ApiClient;
  user: User;
  onUserChange: (user: User) => void;
  onLoggedOut: () => void;
  onProvidersChange: () => void;
}

export function AuthenticatedApp({
  api,
  user,
  onUserChange,
  onLoggedOut,
  onProvidersChange,
}: AuthenticatedAppProps) {
  const [view, setView] = useState<View>("home");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const isAdmin = user.role === "ADMIN";
  // The role is checked here as well: it can change while the admin view is open.
  const activeView: View = isAdmin ? view : "home";

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await apiRequest<void>(API_PATHS.logout, { method: "POST" });
      onLoggedOut();
    } catch (error) {
      setLogoutError(errorMessage(error));
      setLoggingOut(false);
    }
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography noWrap>{user.displayName}</Typography>
            <Typography variant="caption" component="div" noWrap>
              {user.role}
            </Typography>
          </Box>
          <Button color="inherit" onClick={handleLogout} disabled={loggingOut}>
            Abmelden
          </Button>
        </Toolbar>
        {isAdmin && (
          <Box component="nav" aria-label="Hauptnavigation" sx={{ display: "flex", gap: 1, px: 1 }}>
            <NavButton
              label="Start"
              active={activeView === "home"}
              onClick={() => setView("home")}
            />
            <NavButton
              label="Administration"
              active={activeView === "admin"}
              onClick={() => setView("admin")}
            />
          </Box>
        )}
      </AppBar>
      <Container maxWidth="sm" sx={{ py: 3 }}>
        {logoutError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {logoutError}
          </Alert>
        )}
        {activeView === "home" ? (
          <HomeView api={api} user={user} />
        ) : (
          <AdminArea
            api={api}
            currentUser={user}
            onCurrentUserChange={onUserChange}
            onProvidersChange={onProvidersChange}
          />
        )}
      </Container>
    </>
  );
}

interface NavButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavButton({ label, active, onClick }: NavButtonProps) {
  return (
    <Button
      color="inherit"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      sx={{
        borderBottom: 2,
        borderRadius: 0,
        borderColor: active ? "currentColor" : "transparent",
      }}
    >
      {label}
    </Button>
  );
}
