import type { Metadata } from "next";

import CountryDirectory from "@/components/country/CountryDirectory";

export const metadata: Metadata = {
  title: "Countries and regions",
  description: "Country-level disease surveillance directory",
};

export default function CountriesPage() {
  return <CountryDirectory />;
}
