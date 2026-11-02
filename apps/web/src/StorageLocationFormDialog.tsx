import type { StorageLocation } from "@c2r/shared";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import { FormDialog } from "./FormDialog";

interface StorageLocationFormDialogProps {
  /** The location to edit; null creates a new one. */
  location: StorageLocation | null;
  onClose: () => void;
  /** Receives the trimmed, changed name. A thrown error is displayed in the dialog. */
  onSave: (name: string) => Promise<void>;
}

export function StorageLocationFormDialog({
  location,
  onClose,
  onSave,
}: StorageLocationFormDialogProps) {
  const [name, setName] = useState(location?.name ?? "");
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (trimmed === "") {
      throw new Error("Bitte einen Namen eingeben.");
    }
    if (trimmed === location?.name) {
      onClose();
      return;
    }
    setSending(true);
    try {
      await onSave(trimmed);
    } finally {
      setSending(false);
    }
  }

  return (
    <FormDialog
      title={location ? "Lagerort bearbeiten" : "Lagerort anlegen"}
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
        // Read-only instead of disabled: the field keeps its focus and the on-screen keyboard,
        // so a rejected name can be corrected directly.
        slotProps={{
          htmlInput: { inputMode: "text", autoCapitalize: "sentences", readOnly: sending },
        }}
      />
    </FormDialog>
  );
}
