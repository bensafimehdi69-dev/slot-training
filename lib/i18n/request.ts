import { cookies, headers } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import { locales, defaultLocale, LOCALE_COOKIE, type Locale } from "./config"
// Static imports — App Hosting's build pack chokes on the dynamic
// `await import(\`@/messages/${locale}.json\`)` form (works in dev, fails
// production build). Eager-importing all three is fine: each JSON is ~5KB
// and they're shared across server requests anyway.
import frMessages from "@/messages/fr.json"
import enMessages from "@/messages/en.json"
import arMessages from "@/messages/ar.json"

const messagesByLocale: Record<Locale, Record<string, unknown>> = {
  fr: frMessages,
  en: enMessages,
  ar: arMessages,
}

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
    const locale = fromCookie as Locale
    return { locale, messages: messagesByLocale[locale] }
  }

  const acceptLanguage = (await headers()).get("accept-language") ?? ""
  const fromHeader = locales.find((l) => acceptLanguage.toLowerCase().startsWith(l))
  const locale = (fromHeader as Locale | undefined) ?? defaultLocale
  return { locale, messages: messagesByLocale[locale] }
})
