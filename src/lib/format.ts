const ROMAN: ReadonlyArray<[number, string]> = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** 1 → "I", 6 → "VI" (ausreichend für Kapitelnummern bis 39). */
export function toRoman(n: number): string {
  let rest = Math.max(0, Math.floor(n));
  let out = '';
  for (const [value, symbol] of ROMAN) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

/** ISO-Zeitstempel → "HH:MM" in der angegebenen Zeitzone. */
export function formatClock(iso: string, timeZone: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;
  return hour && minute ? `${hour}:${minute}` : null;
}
