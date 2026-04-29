"use client"

import { useEffect } from "react"
import { clearUnreadCount } from "@/lib/actions/notifications"

/**
 * Mounted globally in the root layout. Whenever the user actually has the
 * app in front of them (initial mount + every visibility-visible event),
 * we (a) clear the OS-level app-icon badge, and (b) reset the server-side
 * unread counter so the next push starts the badge fresh from "1". The
 * server action is a no-op for unauthenticated visitors, so it's safe to
 * fire on any page.
 *
 * The Web App Badging API is missing on plenty of platforms (Firefox,
 * non-installed Safari, older Chrome on iOS). Wrapping the call in a
 * feature-check turns this into a no-op there instead of throwing.
 */
export function BadgeClearer() {
  useEffect(() => {
    if (typeof window === "undefined") return
    const reset = () => {
      if (document.visibilityState !== "visible") return
      if (typeof navigator !== "undefined" && "clearAppBadge" in navigator) {
        ;(
          navigator as Navigator & { clearAppBadge?: () => Promise<void> }
        ).clearAppBadge?.().catch(() => {})
      }
      // Best-effort — never block render on a network round-trip and
      // silently swallow auth errors (the action returns 401 for
      // unauthenticated users, which we don't surface anywhere).
      clearUnreadCount().catch(() => {})
    }
    reset()
    document.addEventListener("visibilitychange", reset)
    window.addEventListener("focus", reset)
    return () => {
      document.removeEventListener("visibilitychange", reset)
      window.removeEventListener("focus", reset)
    }
  }, [])
  return null
}
