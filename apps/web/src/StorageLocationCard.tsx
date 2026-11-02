import type { StorageLocation } from "@c2r/shared";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

interface StorageLocationCardProps {
  location: StorageLocation;
  onEdit: () => void;
  onDelete: () => void;
}

export function StorageLocationCard({ location, onEdit, onDelete }: StorageLocationCardProps) {
  return (
    <Card variant="outlined" component="li">
      <CardContent>
        <Typography>Nr. {location.number}</Typography>
        <Typography variant="h6" component="h3" sx={{ overflowWrap: "anywhere" }}>
          {location.name}
        </Typography>
      </CardContent>
      <CardActions sx={{ flexWrap: "wrap", gap: 1 }} disableSpacing>
        <Button onClick={onEdit} aria-label={`Bearbeiten: ${location.name}`}>
          Bearbeiten
        </Button>
        <Button color="error" onClick={onDelete} aria-label={`Löschen: ${location.name}`}>
          Löschen
        </Button>
      </CardActions>
    </Card>
  );
}
