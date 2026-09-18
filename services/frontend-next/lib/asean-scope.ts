export const ASEAN11_SCOPE = "asean11";

/** Stored/API country labels (locations table + KPI fold). */
export const ASEAN11_COUNTRY_NAMES = [
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

/** Product display names use the standard English country names. */
export const ASEAN11_DISPLAY = [
  { value: "Brunei", label: "Brunei" },
  { value: "Cambodia", label: "Cambodia" },
  { value: "Indonesia", label: "Indonesia" },
  { value: "Laos", label: "Lao PDR" },
  { value: "Malaysia", label: "Malaysia" },
  { value: "Myanmar", label: "Myanmar" },
  { value: "Philippines", label: "Philippines" },
  { value: "Singapore", label: "Singapore" },
  { value: "Thailand", label: "Thailand" },
  { value: "Timor-Leste", label: "Timor-Leste" },
  { value: "Vietnam", label: "Viet Nam" },
] as const;

export const ASEAN_SCOPE_FILTER_LABEL = "ASEAN";
export const ASEAN_SCOPE_BANNER = "Scope: ASEAN";
export const ASEAN_SCOPE_HINT =
  "Includes Brunei, Cambodia, Indonesia, Lao PDR, Malaysia, Myanmar, Philippines, Singapore, Thailand, Timor-Leste, and Viet Nam. Outside-ASEAN events are excluded unless Global is selected.";

const ASEAN11_ALIASES: Record<string, string> = {
  brunei: "Brunei",
  "brunei darussalam": "Brunei",
  cambodia: "Cambodia",
  kampuchea: "Cambodia",
  kamboja: "Cambodia",
  indonesia: "Indonesia",
  laos: "Laos",
  "lao pdr": "Laos",
  malaysia: "Malaysia",
  myanmar: "Myanmar",
  burma: "Myanmar",
  philippines: "Philippines",
  "the philippines": "Philippines",
  philippine: "Philippines",
  singapore: "Singapore",
  singapura: "Singapore",
  thailand: "Thailand",
  "timor-leste": "Timor-Leste",
  "timor leste": "Timor-Leste",
  "east timor": "Timor-Leste",
  vietnam: "Vietnam",
  "viet nam": "Vietnam",
};

export const ASEAN_COUNTRY_NAMES = ASEAN11_COUNTRY_NAMES;

export function isAseanDefaultScope(country?: string | null): boolean {
  const value = (country || "").trim().toLowerCase();
  return !value || value === "all" || value === "asean" || value === "asean11";
}

export function isAseanCountryName(country?: string | null): boolean {
  const value = (country || "").trim();
  if (!value || /^outside asean$/i.test(value) || /^other$/i.test(value) || /^global$/i.test(value)) {
    return false;
  }
  return Boolean(ASEAN11_ALIASES[value.toLowerCase()]);
}

export function aseanDisplayName(country?: string | null): string {
  const value = (country || "").trim();
  const canonical = ASEAN11_ALIASES[value.toLowerCase()];
  if (!canonical) return value;
  return ASEAN11_DISPLAY.find((item) => item.value === canonical)?.label || canonical;
}

/** Storage/API label (Laos / Vietnam) for an ASEAN alias, or null if outside the set. */
export function aseanStorageName(country?: string | null): string | null {
  const value = (country || "").trim();
  if (!value) return null;
  return ASEAN11_ALIASES[value.toLowerCase()] || null;
}

export function scopeDashboardLocations<T extends { country?: string | null }>(
  locations: T[] | undefined,
  countryFilter?: string,
): T[] {
  const list = locations || [];
  const scope = !countryFilter || countryFilter === "all" ? "ASEAN" : countryFilter;
  if (scope === "global" || scope === "world") return list;
  if (scope === "ASEAN" || scope === "asean11") {
    return list.filter((item) => isAseanCountryName(item.country));
  }
  const wanted = (ASEAN11_ALIASES[scope.toLowerCase()] || scope).toLowerCase();
  return list.filter((item) => {
    const name = (item.country || "").toLowerCase();
    return name === wanted || ASEAN11_ALIASES[name] === ASEAN11_ALIASES[wanted];
  });
}
