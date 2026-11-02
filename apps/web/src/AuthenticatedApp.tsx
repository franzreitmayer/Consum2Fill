import { API_PATHS, ROLES, type Role, type User } from "@c2r/shared";
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
import { CaptureArea } from "./CaptureArea";
import { MasterDataArea } from "./MasterDataArea";

type View = "capture" | "masterData" | "admin";

interface NavItem {
  view: View;
  label: string;
  roles: readonly Role[];
}

const NAV_ITEMS: readonly NavItem[] = [
  { view: "capture", label: "Erfassung", roles: ROLES },
  { view: "masterData", label: "Stammdaten", roles: ["ADMIN", "MANAGER"] },
  { view: "admin", label: "Administration", roles: ["ADMIN"] },
];

function isAllowed(view: View, role: Role): boolean {
  return NAV_ITEMS.some((item) => item.view === view && item.roles.includes(role));
}

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
  const [view, setView] = useState<View>("capture");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [unsavedNotice, setUnsavedNotice] = useState<string | null>(null);

  const navItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  // The view is checked against the role as well. The role here only changes with the user prop:
  // when an admin edits the own account, or when a 403 in the master data or the capture reloads
  // the user. A role taken away elsewhere stays unnoticed until then.
  const activeView: View = navItems.some((item) => item.view === view) ? view : "capture";

  function changeView(next: View) {
    setUnsavedNotice(null);
    setView(next);
  }

  /** The master data only report a user after a rejected write (403). */
  function handleUserAfterRejectedWrite(updated: User) {
    if (!isAllowed("masterData", updated.role)) {
      changeView("capture");
      setUnsavedNotice(
        "Die Änderung wurde nicht gespeichert, weil die Berechtigung für die Stammdaten entzogen wurde.",
      );
    }
    onUserChange(updated);
  }

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
        <Box component="nav" aria-label="Hauptnavigation" sx={{ display: "flex", px: 0.5 }}>
          {navItems.map((item) => (
            <NavButton
              key={item.view}
              label={item.label}
              active={activeView === item.view}
              onClick={() => changeView(item.view)}
            />
          ))}
        </Box>
      </AppBar>
      <Container maxWidth="sm" sx={{ py: 3 }}>
        {logoutError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {logoutError}
          </Alert>
        )}
        {unsavedNotice && (
          <Alert
            severity="warning"
            closeText="Meldung schließen"
            onClose={() => setUnsavedNotice(null)}
            sx={{ mb: 2 }}
          >
            {unsavedNotice}
          </Alert>
        )}
        {activeView === "capture" && (
          <CaptureArea api={api} user={user} onCurrentUserChange={onUserChange} />
        )}
        {activeView === "masterData" && (
          <MasterDataArea api={api} onCurrentUserChange={handleUserAfterRejectedWrite} />
        )}
        {activeView === "admin" && (
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
        // Normal case and little padding: three items including "Administration" fit into 360 px.
        flex: "1 1 auto",
        minWidth: 0,
        px: 0.5,
        textTransform: "none",
        borderBottom: 2,
        borderRadius: 0,
        borderColor: active ? "currentColor" : "transparent",
      }}
    >
      {label}
    </Button>
  );
}
