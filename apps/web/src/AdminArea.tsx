import type { User } from "@c2r/shared";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { ApiClient } from "./api";
import { OidcSettingsForm } from "./OidcSettingsForm";
import { UsersAdmin } from "./UsersAdmin";

type AdminTab = "users" | "oidc";

interface AdminAreaProps {
  api: ApiClient;
  currentUser: User;
  onCurrentUserChange: (user: User) => void;
  onProvidersChange: () => void;
}

export function AdminArea({
  api,
  currentUser,
  onCurrentUserChange,
  onProvidersChange,
}: AdminAreaProps) {
  const [tab, setTab] = useState<AdminTab>("users");

  // Both panels stay mounted so that switching tabs keeps unsaved input.
  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        Administration
      </Typography>
      <Tabs
        value={tab}
        onChange={(_event, value: AdminTab) => setTab(value)}
        variant="fullWidth"
        aria-label="Administrationsbereiche"
      >
        <Tab
          value="users"
          label="Benutzer"
          id="admin-tab-users"
          aria-controls="admin-panel-users"
        />
        <Tab value="oidc" label="OIDC" id="admin-tab-oidc" aria-controls="admin-panel-oidc" />
      </Tabs>
      <Box
        role="tabpanel"
        id="admin-panel-users"
        aria-labelledby="admin-tab-users"
        hidden={tab !== "users"}
      >
        <UsersAdmin api={api} currentUser={currentUser} onCurrentUserChange={onCurrentUserChange} />
      </Box>
      <Box
        role="tabpanel"
        id="admin-panel-oidc"
        aria-labelledby="admin-tab-oidc"
        hidden={tab !== "oidc"}
      >
        <OidcSettingsForm api={api} onSaved={onProvidersChange} />
      </Box>
    </Stack>
  );
}
