import {
  type CreateMaterialRequest,
  DEFAULT_UNIT,
  type Material,
  MAX_DESCRIPTION_LENGTH,
  type UpdateMaterialRequest,
} from "@c2r/shared";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import { FormDialog } from "./FormDialog";
import { commitTags, type TagInputState, tagSuggestions } from "./tagInput";
import { TagsField } from "./TagsField";

export type MaterialBody = CreateMaterialRequest | UpdateMaterialRequest;

interface MaterialFormDialogProps {
  /** The material to edit; null creates a new one. */
  material: Material | null;
  /** The loaded materials, the source of the tag suggestions. */
  materials: Material[];
  onClose: () => void;
  /** A thrown error is displayed in the dialog. */
  onSave: (body: MaterialBody) => Promise<void>;
}

/** Only what changed, so that an unchanged unit does not touch the lock of a used material. */
function changedFields(material: Material, fields: Required<CreateMaterialRequest>) {
  const body: UpdateMaterialRequest = {};
  if (fields.name !== material.name) body.name = fields.name;
  if (fields.unit !== material.unit) body.unit = fields.unit;
  if (fields.description !== material.description) body.description = fields.description;
  if (fields.tags.join("\n") !== material.tags.join("\n")) body.tags = fields.tags;
  return body;
}

export function MaterialFormDialog({
  material,
  materials,
  onClose,
  onSave,
}: MaterialFormDialogProps) {
  const [name, setName] = useState(material?.name ?? "");
  const [unit, setUnit] = useState(material?.unit ?? DEFAULT_UNIT);
  const [description, setDescription] = useState(material?.description ?? "");
  const [tagInput, setTagInput] = useState<TagInputState>({
    tags: material?.tags ?? [],
    draft: "",
    message: null,
  });
  const [sending, setSending] = useState(false);

  // Like the API, the limit applies without the spaces at the edges.
  const descriptionLength = description.trim().length;
  const descriptionTooLong = descriptionLength > MAX_DESCRIPTION_LENGTH;

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (trimmedName === "") {
      throw new Error("Bitte einen Namen eingeben.");
    }
    if (descriptionTooLong) {
      throw new Error(`Die Beschreibung darf höchstens ${MAX_DESCRIPTION_LENGTH} Zeichen haben.`);
    }
    // Sending by Enter in another field does not leave the tag field, so its text is taken here.
    const committed = commitTags(tagInput.tags, tagInput.draft);
    setTagInput(committed);
    if (committed.draft !== "") {
      throw new Error(committed.message ?? "Die Schlagworte sind ungültig.");
    }

    const fields = {
      name: trimmedName,
      unit: unit.trim() || DEFAULT_UNIT,
      description: description.trim(),
      tags: committed.tags,
    };
    const body = material ? changedFields(material, fields) : fields;
    if (material && Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setSending(true);
    try {
      await onSave(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <FormDialog
      title={material ? "Material bearbeiten" : "Material anlegen"}
      submitLabel="Speichern"
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <TextField
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        fullWidth
        autoComplete="off"
        slotProps={{
          htmlInput: { inputMode: "text", autoCapitalize: "sentences", readOnly: sending },
        }}
      />
      <TextField
        label="Mengeneinheit"
        value={unit}
        onChange={(event) => setUnit(event.target.value)}
        fullWidth
        autoComplete="off"
        helperText={`Ohne Eingabe gilt ${DEFAULT_UNIT}.`}
        slotProps={{ htmlInput: { inputMode: "text", readOnly: sending } }}
      />
      <TextField
        label="Beschreibung"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        multiline
        minRows={3}
        maxRows={10}
        fullWidth
        error={descriptionTooLong}
        // Counted instead of cut off with maxLength, which would silently shorten pasted text.
        helperText={`${descriptionLength} von ${MAX_DESCRIPTION_LENGTH} Zeichen`}
        slotProps={{
          htmlInput: { inputMode: "text", autoCapitalize: "sentences", readOnly: sending },
        }}
      />
      <TagsField
        value={tagInput}
        suggestions={tagSuggestions(materials)}
        readOnly={sending}
        onChange={setTagInput}
      />
    </FormDialog>
  );
}
