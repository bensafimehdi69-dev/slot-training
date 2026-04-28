"use server"

import { cookies } from "next/headers"
import { LOCALE_COOKIE, locales, type Locale } from "@/lib/i18n/config"
import { adminDb } from "@/lib/firebase/admin"
import { getSession, requireManager } from "@/lib/firebase/auth"

/**
 * Persist the user's locale preference in two places:
 * - a cookie so the next request renders the right messages without a
 *   round-trip to Firestore
 * - athletes/{uid}.preferredLanguage or managers/{uid}.preferredLanguage
 *   so emails (server-only, no client cookie available) can pick the
 *   right template per recipient
 *
 * The Firestore write is best-effort: anonymous visitors (no session) get
 * the cookie only.
 */
export async function setLocale(locale: string) {
  if (!(locales as readonly string[]).includes(locale)) {
    return { error: "Locale invalide." }
  }
  const value = locale as Locale

  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, value, {
    path: "/",
    // ~1 year. We don't expect locale to expire — the user changes it
    // explicitly via the picker, or it persists across browsers.
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })

  // Best-effort persistence on the user doc so emails know what language
  // to use. Manager wins over athlete if the same uid happens to be both
  // (rare; mostly defensive).
  try {
    const manager = await requireManager()
    if (manager) {
      await adminDb.collection("managers").doc(manager.uid).set(
        { preferredLanguage: value },
        { merge: true }
      )
      return { success: true }
    }
    const session = await getSession()
    if (session) {
      await adminDb.collection("athletes").doc(session.uid).set(
        { preferredLanguage: value },
        { merge: true }
      )
    }
  } catch (error) {
    console.error(
      "[LOCALE] persist failed:",
      error instanceof Error ? error.message : "unknown"
    )
  }

  return { success: true }
}
