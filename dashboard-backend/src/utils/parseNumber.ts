// Parses Norwegian-formatted numbers like "5 988,90", "-42,622 %", "93%" or "3323,-kr".
export function parseNumber(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text
    .replace(/[\s  ]/g, '')
    .replace(',-', '')
    .replace(/[^\d,.\-−]/g, '')
    .replace('−', '-')
    .replace(',', '.');
  const value = Number.parseFloat(cleaned);
  return Number.isNaN(value) ? null : value;
}
