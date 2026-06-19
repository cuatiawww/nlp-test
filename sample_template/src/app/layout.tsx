import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";

const manrope = Manrope({
  weight: ['300', '400', '500', '600', '700', '800'],
  subsets: ["latin"],
  variable: "--font-manrope",
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Dashboard Laporan KIE — Rekapitulasi Influenza & COVID-19",
  description: "Dashboard Laporan KIE untuk rekapitulasi mingguan dan tahunan kasus Influenza dan COVID-19 di Indonesia",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${manrope.variable} font-manrope antialiased`}>
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
