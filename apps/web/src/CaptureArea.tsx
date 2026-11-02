import type { User } from "@c2r/shared";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ApiClient } from "./api";
import { ConsumptionsAdmin } from "./ConsumptionsAdmin";

interface CaptureAreaProps {
  api: ApiClient;
  user: User;
  /** A change loads the lists again in the background. */
  reloadSignal?: number;
  onCurrentUserChange: (user: User) => void;
}

/** A heading instead of tabs, until the orders join the consumptions here. */
export function CaptureArea({ api, user, reloadSignal, onCurrentUserChange }: CaptureAreaProps) {
  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        Erfassung
      </Typography>
      <Typography variant="h6" component="h2">
        Verbrauch/Bedarf
      </Typography>
      <ConsumptionsAdmin
        api={api}
        user={user}
        reloadSignal={reloadSignal}
        onCurrentUserChange={onCurrentUserChange}
      />
    </Stack>
  );
}
