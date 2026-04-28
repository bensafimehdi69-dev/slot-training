import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "sonner"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Slot Training - Optimisation des créneaux d'entraînement",
  description:
    "Planifiez vos entraînements sportifs en tenant compte des emplois du temps, trajets et contraintes de chaque athlète.",
  // PWA wiring: manifest declares icons + standalone display, apple-* meta
  // tags make iOS Add-to-Home-Screen behave like a native app.
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Slot Training",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
}

// `themeColor` on metadata triggers a deprecation warning in Next 14+ — it
// belongs on the dedicated viewport export, which also lets us use
// `viewportFit: cover` so the app draws under the iOS notch when installed.
export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
