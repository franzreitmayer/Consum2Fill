import type { User } from "@c2r/shared";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

interface UserCardProps {
  user: User;
  isCurrentUser: boolean;
  onEdit: () => void;
  onSetPassword: () => void;
  onDelete: () => void;
}

const WRAP_LONG_TEXT = { overflowWrap: "anywhere" } as const;

export function UserCard({ user, isCurrentUser, onEdit, onSetPassword, onDelete }: UserCardProps) {
  return (
    <Card variant="outlined" component="li">
      <CardContent>
        <Stack spacing={0.5}>
          <Typography variant="h6" component="h2" sx={WRAP_LONG_TEXT}>
            {user.username}
            {isCurrentUser && " (eigenes Konto)"}
          </Typography>
          <Typography sx={WRAP_LONG_TEXT}>{user.displayName}</Typography>
          <Typography sx={WRAP_LONG_TEXT}>{user.email ?? "Keine E-Mail"}</Typography>
          <Typography>Rolle: {user.role}</Typography>
          <Typography>Herkunft: {user.source === "local" ? "lokal" : "IAM"}</Typography>
        </Stack>
      </CardContent>
      <CardActions sx={{ flexWrap: "wrap", gap: 1 }} disableSpacing>
        <Button onClick={onEdit} aria-label={`Bearbeiten: ${user.username}`}>
          Bearbeiten
        </Button>
        {user.source === "local" && (
          <Button onClick={onSetPassword} aria-label={`Passwort setzen: ${user.username}`}>
            Passwort setzen
          </Button>
        )}
        {!isCurrentUser && (
          <Button color="error" onClick={onDelete} aria-label={`Löschen: ${user.username}`}>
            Löschen
          </Button>
        )}
      </CardActions>
    </Card>
  );
}
