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
    <div className="weekly-planning-print mx-auto max-w-[1400px] space-y-5">
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

      {rowTimes.length === 0 ? (
        <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {t("noPlanning")}
        </p>
      ) : (
        // Horizontal scroll on narrow screens — the table needs at least
        // ~960px to be legible. On print we set a wider container width
        // via the print stylesheet so it lays out edge-to-edge.
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-[88px] border-b border-r bg-muted/40 p-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("timeColumn")}
                </th>
                {dayKeys.map((day) => (
                  <th
                    key={day}
                    className="border-b border-r bg-slate-900 p-3 text-center text-xs font-bold uppercase tracking-wider text-white last:border-r-0"
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
                    className="sticky left-0 z-10 border-b border-r bg-muted/40 p-2 text-center align-middle text-xs font-semibold text-muted-foreground"
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

function Cell({ cell }: { cell: SessionCell | undefined }) {
  if (!cell) {
    return <td className="border-b border-r p-2 align-top last:border-r-0" />
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
      className={`border-b border-r p-2 align-top last:border-r-0 ${cellClass}`}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold tracking-wide">
            {cell.session.startTime}–{cell.session.endTime}
          </span>
          <SessionTypeBadge session={cell.session} dark={!isMorning} />
        </div>
        <ul className="space-y-0.5 text-[12px] font-medium leading-tight">
          {cell.session.athletes.map((a) => (
            <li key={a.athleteId} className={subClass}>
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
  const t = useTranslations("weeklyPlanning")
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
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-sm border px-1 py-0 text-[9px] font-semibold uppercase tracking-wider ${colorClass}`}
    >
      {isCollective ? (
        <Users className="h-2.5 w-2.5" />
      ) : (
        <User className="h-2.5 w-2.5" />
      )}
      {isCollective ? t("collectiveBadge") : t("individualBadge")} ·{" "}
      {session.athletes.length}
    </span>
  )
}

function AthleteName({ athlete }: { athlete: AthleteSlotInfo }) {
  const fullName =
    `${athlete.firstName ?? ""} ${athlete.lastName ?? ""}`.trim() || athlete.athleteId
  return <span className="block truncate">{fullName}</span>
}
