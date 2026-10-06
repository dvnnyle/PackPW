// Norwegian number format: 5 988,90
export function formatNumber(value, decimals = 0) {
  if (value == null) return '–';
  const [int, frac] = Math.abs(value).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${value < 0 ? '-' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

export const DAYS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

export function toDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDate(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateString, days) {
  const d = parseDate(dateString);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}
