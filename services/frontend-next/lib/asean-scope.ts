export const ASEAN_COUNTRY_NAMES = [
  "Brunei",
  "Cambodia",
  "Indonesia",
  "Laos",
  "Malaysia",
  "Myanmar",
  "Philippines",
  "Singapore",
  "Thailand",
  "Timor-Leste",
  "Vietnam",
] as const;

export function isAseanCountryName(country?: string | null): boolean {
  const value = (country || "").trim();
  if (!value) return false;
  if (/^outside asean$/i.test(value) || /^other$/i.test(value) || /^global$/i.test(value)) {
    return false;
  }
  return ASEAN_COUNTRY_NAMES.some((name) => name.toLowerCase() === value.toLowerCase());
}

export function scopeDashboardLocations<T extends { country?: string | null }>(
  locations: T[] | undefined,
  countryFilter?: string,
): T[] {
  const list = locations || [];
  const scope = !countryFilter || countryFilter === "all" ? "ASEAN" : countryFilter;
  if (scope === "global" || scope === "world") return list;
  if (scope === "ASEAN") return list.filter((item) => isAseanCountryName(item.country));
  return list.filter((item) => (item.country || "").toLowerCase() === scope.toLowerCase());
}
