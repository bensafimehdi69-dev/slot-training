// Single source of truth for the app's locales. Used both server-side
// (next-intl getRequestConfig) and client-side (language picker, date
// formatters).
export const locales = ["en", "fr", "ar"] as const
// English is the default — the app's primary user base lives in
// Saudi Arabia and most browsers there ship English as the first
// accept-language. French (the language this codebase was originally
// written in) stays available for users who pick it explicitly.
export const defaultLocale: Locale = "en"

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
