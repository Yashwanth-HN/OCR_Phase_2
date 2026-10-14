/**
 * Splits text into sentence-sized pieces for text-to-speech, so the first piece can play while the
 * next is still being generated. Pieces end at . ? ! । or line breaks; short neighbours are merged
 * and anything longer than `max` is split at spaces.
 */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = text
    .split(/(?<=[.?!।\n])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);

  const pieces: string[] = [];
  for (const sentence of sentences) {
    let rest = sentence;
    while (rest.length > max) {
      const cut = rest.lastIndexOf(' ', max);
      const at = cut > 0 ? cut : max;
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) pieces.push(rest);
  }

  const merged: string[] = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.length + piece.length + 1 <= Math.min(max, 80)) {
      merged[merged.length - 1] = `${last} ${piece}`;
    } else {
      merged.push(piece);
    }
  }
  return merged;
}
