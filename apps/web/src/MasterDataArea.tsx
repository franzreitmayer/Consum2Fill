import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ApiClient } from "./api";
import { StorageLocationsAdmin } from "./StorageLocationsAdmin";

interface MasterDataAreaProps {
  api: ApiClient;
}

export function MasterDataArea({ api }: MasterDataAreaProps) {
  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        Stammdaten
      </Typography>
      <Typography variant="h6" component="h2">
        Lagerorte
      </Typography>
      <StorageLocationsAdmin api={api} />
    </Stack>
  );
}
