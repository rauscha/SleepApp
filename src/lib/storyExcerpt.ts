// storyExcerpt (roadmap 6.6) — one line of a story's own prose for its
// Library card, so the list speaks in the stories' voice rather than just
// the user's terse theme. Pulled from the stored script's opening sentence,
// with Claude's [pause]/[softly] stage markers stripped for display.

export function storyExcerpt(script: string, maxLen = 140): string {
  const cleaned = script
    .replace(/\[[^\]]*\]/g, ' ') // drop [pause] / [softly] / etc.
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  // Prefer the first sentence; fall back to the cleaned text.
  const sentence = cleaned.match(/^.*?[.!?](?=\s|$)/);
  let out = sentence ? sentence[0] : cleaned;

  if (out.length > maxLen) {
    const cut = out.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    out = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + '…';
  }
  return out.trim();
}
