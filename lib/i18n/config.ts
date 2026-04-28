// Single source of truth for the app's locales. Used both server-side
// (next-intl getRequestConfig) and client-side (language picker, date
// formatters). Keep "fr" first because it's the historical default —
// matchLocale falls back to it when nothing else is set.
export const locales = ["fr", "en", "ar"] as const
export const defaultLocale: Locale = "fr"

export type Locale = (typeof locales)[number]

export const localeNames: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
}

// Arabic is the only RTL locale we ship today. Listed explicitly so we
// can ask "isRtl(locale)" without inspecting the browser's text-direction
// heuristics — clearer and trivial to extend.
export const rtlLocales: Locale[] = ["ar"]

export function isRtl(locale: Locale): boolean {
  return rtlLocales.includes(locale)
}

// Cookie name used to persist a user's locale across sessions. Server
// reads it during getRequestConfig, the client writes it via the language
// picker. Public-facing — no security implication, just a preference.
export const LOCALE_COOKIE = "preferred-locale"
