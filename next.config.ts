import type { NextConfig } from "next"

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

export default nextConfig
