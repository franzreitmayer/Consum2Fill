import { type Material, MAX_TAG_LENGTH, MAX_TAGS } from "@c2r/shared";

/** The chips, the text still being typed and the note for the last input. */
export interface TagInputState {
  tags: string[];
  draft: string;
  message: string | null;
}

/** The same key as the API uses for finding duplicates. */
export function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Moves the comma separated text to the tags by the rules of the API. Duplicates fall away with a
 * note. What breaks a limit stays in the draft with a message, so that nothing gets lost silently:
 * a non-empty draft afterwards means the input is not complete yet.
 */
export function commitTags(tags: string[], text: string): TagInputState {
  const result = [...tags];
  const keys = new Set(tags.map(tagKey));
  const rejected: string[] = [];
  const messages = new Set<string>();

  for (const part of text.split(",")) {
    const tag = part.trim();
    if (tag === "") continue;
    if (tag.length > MAX_TAG_LENGTH) {
      rejected.push(tag);
      messages.add(`Ein Schlagwort darf höchstens ${MAX_TAG_LENGTH} Zeichen lang sein.`);
    } else if (keys.has(tagKey(tag))) {
      messages.add(`„${tag}“ ist bereits vorhanden.`);
    } else if (result.length >= MAX_TAGS) {
      rejected.push(tag);
      messages.add(`Ein Material darf höchstens ${MAX_TAGS} Schlagworte haben.`);
    } else {
      result.push(tag);
      keys.add(tagKey(tag));
    }
  }

  return {
    tags: result,
    draft: rejected.join(", "),
    message: messages.size > 0 ? [...messages].join(" ") : null,
  };
}

/** All tags of the loaded materials, each once in its first spelling. */
export function tagSuggestions(materials: Material[]): string[] {
  const byKey = new Map<string, string>();
  for (const tag of materials.flatMap((material) => material.tags)) {
    if (!byKey.has(tagKey(tag))) byKey.set(tagKey(tag), tag);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "de"));
}
