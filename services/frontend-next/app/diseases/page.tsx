import type { Metadata } from "next";

import DiseaseDirectory from "@/components/disease/DiseaseDirectory";

export const metadata: Metadata = {
  title: "Disease Directory",
  description: "Local disease directory and surveillance signals",
};

export default function DiseasesPage() {
  return <DiseaseDirectory />;
}
