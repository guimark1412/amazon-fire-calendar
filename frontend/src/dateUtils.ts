// Relative date presets computed from the user's current date (no hardcoded calendars).

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return toIso(new Date());
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toIso(d);
}

export function currentYear(): number {
  return new Date().getFullYear();
}

export function currentMonthIndex(): number {
  return new Date().getMonth();
}

export interface DateRange {
  start: string;
  end: string;
}

export function last7Days(): DateRange {
  return { start: daysAgoIso(6), end: todayIso() };
}

export function last30Days(): DateRange {
  return { start: daysAgoIso(29), end: todayIso() };
}

export function yearToDate(): DateRange {
  return { start: `${currentYear()}-01-01`, end: todayIso() };
}

export function dryPeak(): DateRange {
  const y = currentYear();
  return { start: `${y}-08-01`, end: `${y}-09-30` };
}

export function isSameRange(start: string | null, end: string | null, r: DateRange): boolean {
  return start === r.start && end === r.end;
}

export interface PeriodInfo {
  label: string;
  sublabel: string;
  quarterIdx: number;
}

export function parsePeriodInfo(
  period: string,
  months: readonly string[],
  weekPrefix: string,
): PeriodInfo {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(period);
  if (monthMatch) {
    const [, year, month] = monthMatch;
    const idx = Math.max(0, Math.min(11, parseInt(month, 10) - 1));
    return {
      label: `${months[idx] ?? month}/${year.slice(2)}`,
      sublabel: '',
      quarterIdx: Math.min(3, Math.floor(idx / 3)),
    };
  }

  const weekMatch = /^(\d{4})-W(\d{2})$/.exec(period);
  if (weekMatch) {
    const [, year, weekStr] = weekMatch;
    const weekNum = parseInt(weekStr, 10);
    const monthIdx = Math.min(11, Math.max(0, Math.floor((weekNum - 1) / 4.345)));
    return {
      label: `${weekPrefix} ${String(weekNum).padStart(2, '0')}`,
      sublabel: `${months[monthIdx]}/${year.slice(2)}`,
      quarterIdx: Math.min(3, Math.floor(monthIdx / 3)),
    };
  }

  return { label: period, sublabel: '', quarterIdx: 0 };
}

export function formatPeriodDisplay(
  period: string,
  months: readonly string[],
  weekPrefix: string,
): string {
  const info = parsePeriodInfo(period, months, weekPrefix);
  return info.sublabel ? `${info.label} · ${info.sublabel}` : info.label;
}
