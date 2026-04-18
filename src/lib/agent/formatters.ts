export const MAX_PREVIEW_CHARS = 800;

export function truncate(s: string | null | undefined, n = MAX_PREVIEW_CHARS): string {
  if (!s) return "";
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n) + "…";
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute UTC bounds for a "local day" in a given IANA timezone.
 * Works across DST without pulling in a tz library.
 */
export function dayBoundsInTz(
  localDate: string,
  tz: string
): { startUtc: string; endUtc: string } {
  const probe = new Date(`${localDate}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(probe);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  const offsetMs = asIfUtc - probe.getTime();
  const startLocal = new Date(`${localDate}T00:00:00Z`).getTime() - offsetMs;
  return {
    startUtc: new Date(startLocal).toISOString(),
    endUtc: new Date(startLocal + 24 * 60 * 60 * 1000).toISOString(),
  };
}
