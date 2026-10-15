/** Discord rejects message content longer than this. */
export const DISCORD_MESSAGE_LIMIT = 2000;

/**
 * Splits text into chunks Discord will accept, breaking on line boundaries
 * where possible. A ``` code block that straddles a split is closed at the end
 * of one chunk and reopened at the start of the next, so it keeps rendering.
 */
export function splitMessage(text: string, limit: number = DISCORD_MESSAGE_LIMIT): string[] {
  // Room for the "```\n" we may have to add on either side of a chunk.
  const max = limit - 8;
  const chunks: string[] = [];
  let current = "";
  let inCodeBlock = false;

  const flush = () => {
    if (!current) return;
    chunks.push(inCodeBlock ? current + "\n```" : current);
    current = inCodeBlock ? "```\n" : "";
  };

  for (const rawLine of text.split("\n")) {
    // A single line longer than a chunk gets hard-split.
    const pieces: string[] = [];
    for (let i = 0; i < rawLine.length || i === 0; i += max) {
      pieces.push(rawLine.slice(i, i + max));
    }
    for (const line of pieces) {
      const next = current ? current + "\n" + line : line;
      if (next.length > max) {
        flush();
        current = current ? current + line : line;
      } else {
        current = next;
      }
      if ((line.match(/```/g) || []).length % 2 === 1) inCodeBlock = !inCodeBlock;
    }
  }
  if (current.trim() && current !== "```\n") chunks.push(current);
  return chunks.length > 0 ? chunks : [""];
}
