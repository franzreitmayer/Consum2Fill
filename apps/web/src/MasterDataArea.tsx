import type { User } from "@c2r/shared";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import type { ApiClient } from "./api";
import { MaterialsAdmin } from "./MaterialsAdmin";
import { StorageLocationsAdmin } from "./StorageLocationsAdmin";

type MasterDataTab = "locations" | "materials";

interface MasterDataAreaProps {
  api: ApiClient;
  /** A change loads the lists of both panels again in the background. */
  reloadSignal?: number;
  onCurrentUserChange: (user: User) => void;
}

export function MasterDataArea({ api, reloadSignal, onCurrentUserChange }: MasterDataAreaProps) {
  const [tab, setTab] = useState<MasterDataTab>("locations");

  // Both panels stay mounted so that switching tabs keeps the search and the notices. Each panel
  // refreshes its list when it is shown again.
  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        Stammdaten
      </Typography>
      <Tabs
        value={tab}
        onChange={(_event, value: MasterDataTab) => setTab(value)}
        variant="fullWidth"
        aria-label="Stammdatenbereiche"
      >
        <Tab
          value="locations"
          label="Lagerorte"
          id="master-data-tab-locations"
          aria-controls="master-data-panel-locations"
        />
        <Tab
          value="materials"
          label="Material"
          id="master-data-tab-materials"
          aria-controls="master-data-panel-materials"
        />
      </Tabs>
      <Box
        role="tabpanel"
        id="master-data-panel-locations"
        aria-labelledby="master-data-tab-locations"
        hidden={tab !== "locations"}
      >
        <StorageLocationsAdmin
          api={api}
          active={tab === "locations"}
          reloadSignal={reloadSignal}
          onCurrentUserChange={onCurrentUserChange}
        />
      </Box>
      <Box
        role="tabpanel"
        id="master-data-panel-materials"
        aria-labelledby="master-data-tab-materials"
        hidden={tab !== "materials"}
      >
        <MaterialsAdmin
          api={api}
          active={tab === "materials"}
          reloadSignal={reloadSignal}
          onCurrentUserChange={onCurrentUserChange}
        />
      </Box>
    </Stack>
  );
}
