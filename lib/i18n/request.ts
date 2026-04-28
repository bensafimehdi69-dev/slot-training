import { cookies, headers } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import { locales, defaultLocale, LOCALE_COOKIE, type Locale } from "./config"

/**
 * Resolves the active locale on every request: cookie first (set by the
 * language picker), then Accept-Language fallback so a user landing for
 * the first time gets a sensible default. Falls back to French.
 *
 * Wired through next.config.ts so next-intl picks it up automatically.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value
  if (fromCookie && (locales as readonly string[]).includes(fromCookie)) {
    return { locale: fromCookie as Locale, messages: await loadMessages(fromCookie as Locale) }
  }

  const acceptLanguage = (await headers()).get("accept-language") ?? ""
  const fromHeader = locales.find((l) => acceptLanguage.toLowerCase().startsWith(l))
  const locale = (fromHeader as Locale | undefined) ?? defaultLocale
  return { locale, messages: await loadMessages(locale) }
})

async function loadMessages(locale: Locale) {
  // Static imports keyed by locale — webpack code-splits each JSON into
  // its own chunk, so the user only downloads the one they're using.
  const mod = await import(`@/messages/${locale}.json`)
  return mod.default
}
