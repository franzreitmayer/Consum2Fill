import { API_PATHS, type Material, type User } from "@c2r/shared";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRef, useState } from "react";
import type { ApiClient } from "./api";
import { MaterialCard } from "./MaterialCard";
import { type MaterialBody, MaterialFormDialog } from "./MaterialFormDialog";
import { filterMaterials, isSearching } from "./materialSearch";
import { type RecordActions, RecordAdmin, type RecordAdminTexts, RecordList } from "./RecordAdmin";

const TEXTS: RecordAdminTexts = {
  loading: "Material wird geladen",
  createButton: "Material anlegen",
  empty: "Kein Material vorhanden.",
  deleteTitle: "Material löschen",
  created: "Material angelegt.",
  saved: "Material gespeichert.",
  deleted: "Material gelöscht.",
};

interface MaterialsAdminProps {
  api: ApiClient;
  active?: boolean;
  reloadSignal?: number;
  onCurrentUserChange: (user: User) => void;
}

export function MaterialsAdmin({
  api,
  active,
  reloadSignal,
  onCurrentUserChange,
}: MaterialsAdminProps) {
  // Lives here because the list is replaced while loading: a reload must not end the search.
  const [query, setQuery] = useState("");

  return (
    <RecordAdmin<Material, MaterialBody>
      api={api}
      path={API_PATHS.materials}
      texts={TEXTS}
      recordLabel={(material) => material.name}
      active={active}
      reloadSignal={reloadSignal}
      onCurrentUserChange={onCurrentUserChange}
      renderList={(materials, actions) => (
        <SearchableList
          materials={materials}
          actions={actions}
          query={query}
          onQueryChange={setQuery}
        />
      )}
      renderForm={({ record, records, onClose, onSave }) => (
        <MaterialFormDialog
          material={record}
          materials={records}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    />
  );
}

interface SearchableListProps {
  materials: Material[];
  actions: RecordActions<Material>;
  query: string;
  onQueryChange: (query: string) => void;
}

function SearchableList({ materials, actions, query, onQueryChange }: SearchableListProps) {
  const input = useRef<HTMLInputElement>(null);
  const hits = filterMaterials(materials, query);

  return (
    <Stack spacing={2}>
      <TextField
        label="Material suchen"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        fullWidth
        autoComplete="off"
        inputRef={input}
        slotProps={{
          htmlInput: {
            inputMode: "search",
            enterKeyHint: "search",
            // The field has its own button for clearing, which is the same in every browser.
            sx: { "&::-webkit-search-cancel-button": { display: "none" } },
          },
          input: {
            endAdornment: query !== "" && (
              <InputAdornment position="end">
                <IconButton
                  aria-label="Suche löschen"
                  edge="end"
                  onClick={() => {
                    onQueryChange("");
                    input.current?.focus();
                  }}
                >
                  ×
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      {isSearching(query) && (
        <Typography role="status" color="text.secondary">
          Suche aktiv: {hits.length} von {materials.length}{" "}
          {materials.length === 1 ? "Material" : "Materialien"}
        </Typography>
      )}
      {hits.length === 0 ? (
        <Typography sx={{ overflowWrap: "anywhere" }}>
          Keine Treffer für „{query.trim()}“.
        </Typography>
      ) : (
        <RecordList>
          {hits.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              onEdit={() => actions.onEdit(material)}
              onDelete={() => actions.onDelete(material)}
            />
          ))}
        </RecordList>
      )}
    </Stack>
  );
}
