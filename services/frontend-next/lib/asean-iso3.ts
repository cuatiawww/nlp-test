export const ASEAN11_ISO3 = {
  Brunei: "BRN",
  Cambodia: "KHM",
  Indonesia: "IDN",
  Laos: "LAO",
  Malaysia: "MYS",
  Myanmar: "MMR",
  Philippines: "PHL",
  Singapore: "SGP",
  Thailand: "THA",
  "Timor-Leste": "TLS",
  Vietnam: "VNM",
}

export const ISO3_TO_NAME = Object.fromEntries(
  Object.entries(ASEAN11_ISO3).map(([name, iso3]) => [iso3, name]),
)

export const ISO3_DISPLAY = {
  BRN: "Brunei",
  KHM: "Cambodia",
  IDN: "Indonesia",
  LAO: "Lao PDR",
  MYS: "Malaysia",
  MMR: "Myanmar",
  PHL: "Philippines",
  SGP: "Singapore",
  THA: "Thailand",
  TLS: "Timor-Leste",
  VNM: "Viet Nam",
}

/** ColorBrewer Blues 6 — sequential, color-blind safer than rainbow. */
export const CHOROPLETH_BLUES = ["#eff3ff", "#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c"]
export const NO_DATA_FILL = "#d0d5dd"
