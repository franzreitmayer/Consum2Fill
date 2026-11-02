import type { Material } from "@c2r/shared";

function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** True when the query holds at least one word, i.e. when the search narrows the list at all. */
export function isSearching(query: string): boolean {
  return searchWords(query).length > 0;
}

/**
 * Every word has to occur in the name, the description or a tag, also as a part of a word and
 * spread over different fields. Each field is checked on its own, so that a word cannot match
 * across the border of two fields.
 */
export function filterMaterials(materials: Material[], query: string): Material[] {
  const words = searchWords(query);
  return materials.filter((material) => {
    const fields = [material.name, material.description, ...material.tags].map((field) =>
      field.toLowerCase(),
    );
    return words.every((word) => fields.some((field) => field.includes(word)));
  });
}
