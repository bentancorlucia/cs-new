export const URUGUAY_TZ = "America/Montevideo";
const URUGUAY_OFFSET_HOURS = 3;

export function uruguayNowParts(): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: URUGUAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = fmt.format(new Date()).split("-").map(Number);
  return { year, month, day };
}

export function uruguayDayStartUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, URUGUAY_OFFSET_HOURS, 0, 0));
}

export function uruguayDateKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: URUGUAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
