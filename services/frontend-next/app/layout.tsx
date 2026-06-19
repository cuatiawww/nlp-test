import type { Metadata } from "next"
import { Manrope } from "next/font/google"
import "./globals.css"
import LayoutContent from "@/components/layout/LayoutContent"

const manrope = Manrope({
  weight: ['300', '400', '500', '600', '700', '800'],
  subsets: ["latin"],
  variable: "--font-manrope",
  display: 'swap',
})

export const metadata: Metadata = {
  title: "Disease Surveillance AI",
  description: "Multilingual NLP Disease Monitoring Dashboard",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id">
      <body className={`${manrope.variable} font-manrope antialiased`}>
        <LayoutContent>{children}</LayoutContent>
      </body>
    </html>
  )
}
