// Reads the first <table> in server-rendered HTML into header names and rows of cell text.
// Enough for simple admin tables (no nested tables); avoids loading the page in a browser.
function cellText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTable(html: string): { headers: string[]; rows: string[][] } {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0] ?? '';
  const head = table.match(/<thead[\s\S]*?<\/thead>/i)?.[0] ?? '';
  const body = table.match(/<tbody[\s\S]*?<\/tbody>/i)?.[0] ?? '';
  const headers = [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => cellText(m[1]));
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
    [...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1])),
  );
  return { headers, rows };
}
