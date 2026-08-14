// Comma is the assumed OR separator in Pokémon GO's search bar. Assumed, not
// verified — docs/reference/open-questions.md lists the manual in-game tests
// that confirm it, along with the (unknown) length cap that motivates chunking.
export const SEPARATOR = ",";

/**
 * Greedily pack terms into chunks whose joined length stays within maxChars.
 * Terms are never split, never reordered, and each appears exactly once.
 */
export function chunkTerms(terms: readonly string[], maxChars: number): string[][] {
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error(`Chunk budget must be a positive integer, got ${maxChars}.`);
  }
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;
  for (const term of terms) {
    if (term.length > maxChars) {
      throw new Error(
        `Term "${term}" (${term.length} chars) exceeds the ${maxChars}-char chunk budget.`,
      );
    }
    const extra = current.length === 0 ? term.length : SEPARATOR.length + term.length;
    if (currentLen + extra > maxChars) {
      chunks.push(current);
      current = [term];
      currentLen = term.length;
    } else {
      current.push(term);
      currentLen += extra;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

export function joinChunk(chunk: readonly string[]): string {
  return chunk.join(SEPARATOR);
}
