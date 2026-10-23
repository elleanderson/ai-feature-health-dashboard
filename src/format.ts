const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const gbpPence = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 3, maximumFractionDigits: 3 });
const whole = new Intl.NumberFormat('en-GB');
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

export const money = (n: number) => gbp.format(n);
export const unitMoney = (n: number) => gbpPence.format(n);
export const count = (n: number) => whole.format(Math.round(n));
export const pct = (n: number, dp = 0) => `${(n * 100).toFixed(dp)}%`;
export const secs = (n: number) => `${n.toFixed(1)}s`;
export const day = (d: Date) => shortDate.format(d);

export function change(now: number, before: number): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (!before) return { text: 'no comparison', dir: 'flat' };
  const c = (now - before) / before;
  if (Math.abs(c) < 0.005) return { text: 'level with the previous period', dir: 'flat' };
  return { text: `${c > 0 ? '+' : ''}${(c * 100).toFixed(0)}% on the previous period`, dir: c > 0 ? 'up' : 'down' };
}
