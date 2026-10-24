/** Reine Layout-Helfer für das PDF (ohne pdf-lib-Abhängigkeit → testbar). */

export type Measure = (text: string) => number;

/**
 * Bricht Text in Zeilen um, die nicht breiter als `maxWidth` sind.
 * Überlange Einzelwörter werden hart getrennt. Zeilenumbrüche im Text bleiben erhalten.
 */
export function wrapText(text: string, measure: Measure, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word) <= maxWidth) {
        line = word;
        continue;
      }
      // Hartes Trennen eines sehr langen Wortes
      let chunk = '';
      for (const ch of word) {
        if (measure(chunk + ch) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Begrenzt Zeilen und setzt bei Kürzung eine Ellipse ans Ende. */
export function clampLines(lines: string[], maxLines: number, measure: Measure, maxWidth: number): string[] {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, Math.max(1, maxLines));
  let last = kept[kept.length - 1] ?? '';
  while (last.length > 0 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
  kept[kept.length - 1] = `${last.trimEnd()}…`;
  return kept;
}

/** Entfernt Zeichen, die in den eingebetteten Fonts nicht existieren (z. B. Emoji). */
export function sanitizeForFont(text: string, hasGlyph: (codePoint: number) => boolean): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === '\n' || hasGlyph(cp)) out += ch;
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim();
}
