import type { Material } from "@c2r/shared";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import { TagChip } from "./TagChip";

interface MaterialCardProps {
  material: Material;
  onEdit: () => void;
  onDelete: () => void;
}

export function MaterialCard({ material, onEdit, onDelete }: MaterialCardProps) {
  return (
    <Card variant="outlined" component="li">
      <CardContent>
        <Typography>Nr. {material.number}</Typography>
        <Typography variant="h6" component="h3" sx={{ overflowWrap: "anywhere" }}>
          {material.name}
        </Typography>
        <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
          Mengeneinheit: {material.unit}
        </Typography>
        {material.description !== "" && (
          <Typography sx={{ mt: 1, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {material.description}
          </Typography>
        )}
        {material.tags.length > 0 && (
          <Box
            role="group"
            aria-label="Schlagworte"
            sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}
          >
            {material.tags.map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </Box>
        )}
      </CardContent>
      <CardActions sx={{ flexWrap: "wrap", gap: 1 }} disableSpacing>
        <Button onClick={onEdit} aria-label={`Bearbeiten: ${material.name}`}>
          Bearbeiten
        </Button>
        <Button color="error" onClick={onDelete} aria-label={`Löschen: ${material.name}`}>
          Löschen
        </Button>
      </CardActions>
    </Card>
  );
}
