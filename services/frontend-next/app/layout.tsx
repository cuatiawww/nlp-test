import type { Metadata } from "next"
import { Roboto } from "next/font/google"
import "./globals.css"
import LayoutContent from "@/components/layout/LayoutContent"

const roboto = Roboto({
  weight: ['300', '400', '500', '700', '900'],
  subsets: ["latin"],
  variable: "--font-roboto",
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
      <body className={`${roboto.variable} font-roboto antialiased`}>
        <LayoutContent>{children}</LayoutContent>
      </body>
    </html>
  )
}
