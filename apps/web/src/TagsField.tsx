import { MAX_TAGS } from "@c2r/shared";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { type FocusEvent, type KeyboardEvent, useRef, useState } from "react";
import { TagChip } from "./TagChip";
import { commitTags, tagKey, type TagInputState } from "./tagInput";

interface TagsFieldProps {
  value: TagInputState;
  suggestions: string[];
  readOnly: boolean;
  onChange: (value: TagInputState) => void;
}

/** Tags as chips. Enter, a comma and leaving the field turn the typed text into tags. */
export function TagsField({ value, suggestions, readOnly, onChange }: TagsFieldProps) {
  const { tags, draft, message } = value;
  const [menuOpen, setMenuOpen] = useState(false);
  // Only an option chosen with the arrow keys beats the typed text when pressing Enter.
  const keyboardOption = useRef<string | null>(null);

  function commit(text: string) {
    onChange(commitTags(tags, text));
  }

  function handleInputChange(text: string, reason: string) {
    // The other reasons are resets by the Autocomplete; the draft is only changed from here.
    if (reason !== "input") return;
    // Checked on the text, because a virtual keyboard may send no key event with the comma.
    if (text.includes(",")) commit(text);
    else onChange({ tags, draft: text, message: null });
  }

  function handleKeyDown(event: KeyboardEvent & { defaultMuiPrevented?: boolean }) {
    if (event.key !== "Enter") return;
    // Enter never sends the form from here, also not with an empty field.
    event.preventDefault();
    if (keyboardOption.current !== null) return;
    event.defaultMuiPrevented = true;
    if (!readOnly) commit(draft);
  }

  function handleBlur(event: FocusEvent) {
    // Choosing a suggestion must not turn the typed part of the word into a tag first.
    const target = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (readOnly || target?.closest("[role=listbox]")) return;
    if (draft.trim() !== "") commit(draft);
  }

  const invalid = draft.trim() !== "" && message !== null;

  return (
    <Autocomplete<string, true, true, true>
      multiple
      freeSolo
      disableClearable
      forcePopupIcon={false}
      filterSelectedOptions
      readOnly={readOnly}
      options={suggestions}
      isOptionEqualToValue={(option, selected) => tagKey(option) === tagKey(selected)}
      value={tags}
      inputValue={draft}
      // No list over the empty field: on a phone, it would cover the form with every tap.
      open={menuOpen && draft.trim() !== ""}
      onOpen={() => setMenuOpen(true)}
      onClose={() => {
        keyboardOption.current = null;
        setMenuOpen(false);
      }}
      onHighlightChange={(_event, option, reason) => {
        keyboardOption.current = reason === "keyboard" ? option : null;
      }}
      onInputChange={(_event, text, reason) => handleInputChange(text, reason)}
      onChange={(_event, next, reason, details) => {
        if (reason === "removeOption") onChange({ tags: next, draft, message: null });
        else if (details) commit(details.option);
      }}
      onKeyDown={handleKeyDown}
      renderValue={(selected, getItemProps) =>
        selected.map((tag, index) => {
          const { key, onDelete, ...itemProps } = getItemProps({ index });
          return (
            <TagChip
              key={key}
              {...itemProps}
              tag={tag}
              onDelete={readOnly ? undefined : onDelete}
            />
          );
        })
      }
      slotProps={{ listbox: { sx: { "& .MuiAutocomplete-option": { minHeight: 48 } } } }}
      // Chips of 40 px with this margin give rows of 48 px for the removal buttons.
      sx={{ "&& .MuiAutocomplete-tag": { m: "4px", maxWidth: "calc(100% - 8px)" } }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Schlagworte"
          error={invalid}
          onBlur={handleBlur}
          helperText={message ?? `${tags.length} von ${MAX_TAGS}. Bestätigen mit Enter oder Komma.`}
          slotProps={{
            ...params.slotProps,
            htmlInput: {
              ...params.slotProps.htmlInput,
              inputMode: "text",
              autoCapitalize: "sentences",
              enterKeyHint: "enter",
            },
          }}
        />
      )}
    />
  );
}
