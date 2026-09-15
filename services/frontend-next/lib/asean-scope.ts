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

/** Product display names: Lao PDR and Viet Nam rather than Laos/Vietnam. */
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

export const ASEAN_SCOPE_FILTER_LABEL = "ASEAN — all locations";
export const ASEAN_SCOPE_BANNER = "Totals shown: ASEAN 11 jurisdictions";
export const ASEAN_SCOPE_HINT =
  "Default scope is ASEAN + Timor-Leste (11). A member with zero events is still a jurisdiction; it is not dropped from the set. Outside-ASEAN points (Utah/US, India, DRC, Europe, Brazil, etc.) are excluded unless you choose Global.";

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
  if (!value) return false;
  if (/^outside asean$/i.test(value) || /^other$/i.test(value) || /^global$/i.test(value)) {
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
