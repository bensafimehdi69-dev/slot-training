"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import {
  ArrowLeft,
  Printer,
  Users,
  User,
  MapPin,
  CalendarDays,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { dayKeys, type DayKey } from "@/lib/types/schedule"
import type {
  AthleteSlotInfo,
  DailySession,
  OptimizationResult,
} from "@/lib/types/planning"

interface WeeklyPlanningViewProps {
  groupName: string
  startDate: string
  endDate: string
  trainingLocation: string
  result: OptimizationResult
}

interface SessionCell {
  session: DailySession
  window: "morning" | "end-of-day"
}

interface AthleteRow {
  athleteId: string
  name: string
  collective: number
  individual: number
}

/**
 * Standalone full-screen weekly planning rendered as a real timetable —
 * day columns × start-time rows. Distinct from the dashboard's inline
 * per-day breakdown: this is the print-and-pin-on-the-wall view, so each
 * (day, slot) cell shows the type, the time range, and every assigned
 * athlete name. Morning slots use a warm tint, end-of-day a dark one,
 * matching the gym-class reference layout.
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

  const { rowTimes, byDayTime, totalSessions } = useMemo(() => {
    // For every day in the planning, flatten morning + end-of-day sessions
    // into one list and bucket them per start time so the grid lookup is
    // O(1). The morningSessions array already comes back from the optimiser
    // in chronological order, but we'd rather not rely on that here.
    const map = new Map<string, Map<string, SessionCell>>()
    const times = new Set<string>()
    let total = 0

    for (const day of result.dailyPlannings) {
      const all: SessionCell[] = []
      for (const m of day.morningSessions) {
        all.push({ session: m, window: "morning" })
      }
      if (day.endOfDaySession) {
        all.push({ session: day.endOfDaySession, window: "end-of-day" })
      }
      total += all.length

      const dayMap = new Map<string, SessionCell>()
      for (const cell of all) {
        dayMap.set(cell.session.startTime, cell)
        times.add(cell.session.startTime)
      }
      map.set(day.dayKey, dayMap)
    }

    return {
      rowTimes: Array.from(times).sort(),
      byDayTime: map,
      totalSessions: total,
    }
  }, [result.dailyPlannings])

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
    // Negative margins escape the manager layout's `<main className="container
    // mx-auto px-4 py-8">` so the planning takes the full viewport width.
    // Goal: a screenshot-ready single-screen view with no horizontal scroll
    // even on a 1024-wide laptop.
    <div className="weekly-planning-print -mx-4 -my-8 flex min-h-[calc(100dvh-4rem)] flex-col gap-3 px-4 py-3">
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

      <header className="space-y-0.5">
        <h1 className="text-xl font-bold sm:text-2xl">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground sm:text-sm">
          <span>{groupName}</span>
          <span>·</span>
          <span>{t("subtitle", { start: startDate, end: endDate })}</span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {t("totalSessions", { count: totalSessions })}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            <span className="max-w-[320px] truncate">{trainingLocation}</span>
          </span>
        </div>
      </header>

      {rowTimes.length === 0 ? (
        <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {t("noPlanning")}
        </p>
      ) : (
        // No min-width / no overflow scroll: the table fills the available
        // width and the time column gets a fixed narrow width so the 7 day
        // columns share the rest equally. table-fixed locks the column
        // widths so cells never push the table past the viewport.
        <div className="rounded-lg border bg-card">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[64px]" />
              {dayKeys.map((day) => (
                <col key={day} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="border-b border-r bg-muted/40 p-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("timeColumn")}
                </th>
                {dayKeys.map((day) => (
                  <th
                    key={day}
                    className="border-b border-r bg-slate-900 p-2 text-center text-[11px] font-bold uppercase tracking-wider text-white last:border-r-0"
                  >
                    {td(day as DayKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowTimes.map((time) => (
                <tr key={time}>
                  <th
                    scope="row"
                    className="border-b border-r bg-muted/40 p-1.5 text-center align-middle text-[11px] font-semibold text-muted-foreground"
                  >
                    {time}
                  </th>
                  {dayKeys.map((day) => {
                    const cell = byDayTime.get(day)?.get(time)
                    return (
                      <Cell key={`${day}-${time}`} cell={cell} />
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {athleteRecap.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-sm font-semibold">{t("athleteRecapTitle")}</h2>
          <ul className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {athleteRecap.map((row) => (
              <li
                key={row.athleteId}
                className="flex items-center justify-between rounded-md border bg-card px-2 py-1 text-xs"
              >
                <span className="truncate font-medium">{row.name}</span>
                <span className="ml-2 flex shrink-0 gap-1 text-[10px]">
                  <Badge
                    variant="outline"
                    className="border-blue-200 bg-blue-50 px-1 py-0 leading-4 text-blue-700"
                  >
                    <Users className="mr-0.5 h-2.5 w-2.5" />
                    {row.collective}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-orange-200 bg-orange-50 px-1 py-0 leading-4 text-orange-700"
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

function Cell({ cell }: { cell: SessionCell | undefined }) {
  if (!cell) {
    return <td className="border-b border-r p-1.5 align-top last:border-r-0" />
  }
  const isMorning = cell.window === "morning"
  // Morning slots get a warm yellow palette, end-of-day a dark slate one
  // (the user-supplied reference layout swaps morning/evening on background
  // tone — same idea here).
  const cellClass = isMorning
    ? "bg-amber-100 text-slate-900"
    : "bg-slate-900 text-white"
  const subClass = isMorning ? "text-slate-700" : "text-slate-300"

  return (
    <td
      className={`border-b border-r p-1.5 align-top last:border-r-0 ${cellClass}`}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-bold tracking-tight">
            {cell.session.startTime}–{cell.session.endTime}
          </span>
          <SessionTypeBadge session={cell.session} dark={!isMorning} />
        </div>
        <ul className="space-y-0 text-[11px] font-medium leading-tight">
          {cell.session.athletes.map((a) => (
            <li key={a.athleteId} className={`${subClass} truncate`}>
              <AthleteName athlete={a} />
            </li>
          ))}
        </ul>
      </div>
    </td>
  )
}

function SessionTypeBadge({
  session,
  dark,
}: {
  session: DailySession
  dark: boolean
}) {
  // Short labels ("Coll." / "Indiv.") from the existing planning namespace —
  // the cells are narrow so the long "Collective" / "Individual" forms used
  // elsewhere don't fit cleanly alongside the count and time range.
  const tp = useTranslations("planning")
  const isCollective = session.type === "collective"
  // Two palettes so the badge stays legible on both the warm (morning) and
  // dark (end-of-day) cell backgrounds.
  const colorClass = isCollective
    ? dark
      ? "bg-blue-500/30 text-blue-100 border-blue-400/40"
      : "bg-blue-600 text-white border-transparent"
    : dark
      ? "bg-orange-500/30 text-orange-100 border-orange-400/40"
      : "bg-orange-500 text-white border-transparent"
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-sm border px-1 py-0 text-[8px] font-semibold uppercase tracking-tight ${colorClass}`}
    >
      {isCollective ? (
        <Users className="h-2 w-2" />
      ) : (
        <User className="h-2 w-2" />
      )}
      {isCollective ? tp("collective") : tp("individual")}·
      {session.athletes.length}
    </span>
  )
}

function AthleteName({ athlete }: { athlete: AthleteSlotInfo }) {
  const fullName =
    `${athlete.firstName ?? ""} ${athlete.lastName ?? ""}`.trim() || athlete.athleteId
  return <span className="block truncate">{fullName}</span>
}
