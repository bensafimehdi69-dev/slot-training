"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import {
  ArrowLeft,
  Printer,
  Users,
  User,
  Sunrise,
  Moon,
  MapPin,
  CalendarDays,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
  AthleteSlotInfo,
  DailyPlanning,
  DailySession,
  OptimizationResult,
} from "@/lib/types/planning"
import type { DayKey } from "@/lib/types/schedule"

interface WeeklyPlanningViewProps {
  groupName: string
  startDate: string
  endDate: string
  trainingLocation: string
  result: OptimizationResult
}

interface AthleteRow {
  athleteId: string
  name: string
  collective: number
  individual: number
}

/**
 * Standalone full-screen weekly planning. The dashboard inline view is dense
 * and meant to fit a campaign card; this view re-uses the same data but
 * spreads the per-day blocks across the screen, surfaces every athlete name
 * inline (no chevron-to-expand), and adds a print stylesheet so the manager
 * can hand a paper copy to a coach. Nothing here mutates the campaign — it's
 * a presentational view, all actions stay on the dashboard card.
 */
export function WeeklyPlanningView({
  groupName,
  startDate,
  endDate,
  trainingLocation,
  result,
}: WeeklyPlanningViewProps) {
  const t = useTranslations("weeklyPlanning")
  const td = useTranslations("days")

  const totalSessions = useMemo(
    () =>
      result.dailyPlannings.reduce(
        (n, p) => n + (p.endOfDaySession ? 1 : 0) + p.morningSessions.length,
        0
      ),
    [result.dailyPlannings]
  )

  const athleteRecap = useMemo<AthleteRow[]>(() => {
    const map = new Map<string, AthleteRow>()
    for (const day of result.dailyPlannings) {
      const sessions: DailySession[] = [
        ...(day.endOfDaySession ? [day.endOfDaySession] : []),
        ...day.morningSessions,
      ]
      for (const s of sessions) {
        for (const a of s.athletes) {
          const fullName =
            `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.athleteId
          let row = map.get(a.athleteId)
          if (!row) {
            row = {
              athleteId: a.athleteId,
              name: fullName,
              collective: 0,
              individual: 0,
            }
            map.set(a.athleteId, row)
          }
          if (s.type === "collective") row.collective += 1
          else row.individual += 1
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    )
  }, [result.dailyPlannings])

  return (
    <div className="weekly-planning-print mx-auto max-w-7xl space-y-5">
      {/* Toolbar — hidden on print so the printed page only carries the
          planning itself. */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          aria-label={t("print")}
        >
          <Printer className="mr-1 h-4 w-4" />
          {t("print")}
        </Button>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {groupName} · {t("subtitle", { start: startDate, end: endDate })}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-4 w-4" />
            {t("totalSessions", { count: totalSessions })}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {trainingLocation}
          </span>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {result.dailyPlannings.map((day) => (
          <DayCard key={day.dayKey} planning={day} dayLabel={td(day.dayKey as DayKey)} />
        ))}
      </section>

      {athleteRecap.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t("athleteRecapTitle")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {athleteRecap.map((row) => (
              <li
                key={row.athleteId}
                className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
              >
                <span className="truncate font-medium">{row.name}</span>
                <span className="ml-2 flex shrink-0 gap-1.5 text-xs">
                  <Badge
                    variant="outline"
                    className="border-blue-200 bg-blue-50 px-1.5 py-0 leading-4 text-blue-700"
                  >
                    <Users className="mr-0.5 h-2.5 w-2.5" />
                    {row.collective}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-orange-200 bg-orange-50 px-1.5 py-0 leading-4 text-orange-700"
                  >
                    <User className="mr-0.5 h-2.5 w-2.5" />
                    {row.individual}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function DayCard({
  planning,
  dayLabel,
}: {
  planning: DailyPlanning
  dayLabel: string
}) {
  const t = useTranslations("weeklyPlanning")
  const hasAny =
    planning.endOfDaySession !== null || planning.morningSessions.length > 0

  return (
    <article
      className={
        // break-inside-avoid keeps each day's block on a single printed page
        // when the browser paginates the grid.
        "flex flex-col gap-2 rounded-lg border bg-card p-3 break-inside-avoid"
      }
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{dayLabel}</h2>
        {!hasAny && (
          <span className="text-xs italic text-muted-foreground">
            {t("noSessionDay")}
          </span>
        )}
      </header>

      {planning.morningSessions.map((s) => (
        <SessionBlock
          key={`m-${s.startTime}-${s.athletes[0]?.athleteId ?? "x"}`}
          session={s}
          window="morning"
        />
      ))}
      {planning.endOfDaySession && (
        <SessionBlock session={planning.endOfDaySession} window="end-of-day" />
      )}
    </article>
  )
}

function SessionBlock({
  session,
  window,
}: {
  session: DailySession
  window: "morning" | "end-of-day"
}) {
  const t = useTranslations("weeklyPlanning")
  const Icon = window === "morning" ? Sunrise : Moon
  const isCollective = session.type === "collective"

  return (
    <div
      className={
        // Coloured left border + soft tint so collective vs individual
        // sessions read at a glance even when printed in black & white.
        isCollective
          ? "rounded-md border border-blue-200 bg-blue-50/50 px-2.5 py-2"
          : "rounded-md border border-orange-200 bg-orange-50/50 px-2.5 py-2"
      }
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-semibold">
          {session.startTime} – {session.endTime}
        </span>
        <Badge
          className={
            isCollective
              ? "bg-blue-600 px-1.5 py-0 text-[10px] leading-4 text-white"
              : "border-orange-300 bg-orange-100 px-1.5 py-0 text-[10px] leading-4 text-orange-800"
          }
          variant={isCollective ? "default" : "outline"}
        >
          {isCollective ? (
            <Users className="mr-0.5 h-2.5 w-2.5" />
          ) : (
            <User className="mr-0.5 h-2.5 w-2.5" />
          )}
          {isCollective ? t("collectiveBadge") : t("individualBadge")} ·{" "}
          {session.athletes.length}
        </Badge>
      </div>
      <ul className="space-y-0.5 pl-1 text-[13px]">
        {session.athletes.map((a) => (
          <li key={a.athleteId} className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-muted-foreground" aria-hidden="true" />
            <AthleteName athlete={a} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function AthleteName({ athlete }: { athlete: AthleteSlotInfo }) {
  const fullName =
    `${athlete.firstName ?? ""} ${athlete.lastName ?? ""}`.trim() || athlete.athleteId
  return <span className="truncate">{fullName}</span>
}
