import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

// Points next-intl at our request-config so it can read messages + locale
// without any explicit wiring at the page level.
const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts")

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin"],
  // Pin the workspace root to this project. Without it, Turbopack walks up
  // until it finds the first package-lock.json — which on this machine is an
  // accidental one in $HOME — and picks the wrong root.
  turbopack: {
    root: import.meta.dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
}

export default withNextIntl(nextConfig)
