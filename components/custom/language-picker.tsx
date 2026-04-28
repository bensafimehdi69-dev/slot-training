"use client"

import { useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Globe, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { locales, localeNames, type Locale } from "@/lib/i18n/config"
import { setLocale } from "@/lib/actions/locale"

/**
 * Compact picker that swaps the active language. The active locale is
 * read from next-intl's context, so the trigger always reflects the
 * current state. Selection writes a cookie + the user's Firestore doc
 * (so emails go out in the right language) and reloads the page so
 * server components re-render with new messages.
 */
export function LanguagePicker({ className }: { className?: string }) {
  const tc = useTranslations("common")
  const locale = useLocale() as Locale
  const [pending, startTransition] = useTransition()

  function pick(target: Locale) {
    if (target === locale) return
    startTransition(async () => {
      await setLocale(target)
      // Server components are tied to the locale cookie at render time,
      // so a hard refresh is the simplest way to pick up the new strings
      // everywhere — including pages already in the back/forward cache.
      window.location.reload()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={className}
          disabled={pending}
          aria-label={tc("language")}
        >
          <Globe className="mr-2 h-4 w-4" />
          {localeNames[locale]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onSelect={() => pick(loc)}
            className="flex items-center justify-between gap-4"
          >
            <span>{localeNames[loc]}</span>
            {loc === locale && <Check className="h-4 w-4 text-blue-600" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
