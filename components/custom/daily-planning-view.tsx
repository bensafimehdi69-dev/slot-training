"use client"

import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users,
  User,
  Sunrise,
  Moon,
  CalendarDays,
} from "lucide-react"
import { TravelModeBadges } from "@/components/custom/travel-mode-badges"
import type { DailyPlanning, DailySession } from "@/lib/types/planning"

interface DailyPlanningViewProps {
  dailyPlannings: DailyPlanning[]
}

/**
 * Per-day breakdown of the optimisation result. One card per weekday with up
 * to two sessions: the end-of-day session (collective preferred, individual
 * if only one athlete is available) and the morning session(s) — either a
 * single collective when ≥5 athletes are available in the morning, or one
 * individual session per available athlete.
 *
 * Days with no plannable session are still rendered so the manager sees the
 * full week at a glance and can spot empty days that may need a follow-up.
 */
export function DailyPlanningView({ dailyPlannings }: DailyPlanningViewProps) {
  const tp = useTranslations("planning")
  if (dailyPlannings.length === 0) return null

  const totalSessions = dailyPlannings.reduce(
    (n, p) =>
      n + (p.endOfDaySession ? 1 : 0) + p.morningSessions.length,
    0
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-blue-600" />
          {tp("perDayTitle", { count: totalSessions })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {dailyPlannings.map((planning) => (
          <DayBlock key={planning.dayKey} planning={planning} />
        ))}
      </CardContent>
    </Card>
  )
}

function DayBlock({ planning }: { planning: DailyPlanning }) {
  const tp = useTranslations("planning")
  const hasAny =
    planning.endOfDaySession !== null || planning.morningSessions.length > 0

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium">{planning.day}</p>
        {!hasAny && (
          <span className="text-xs italic text-muted-foreground">
            {tp("noSession")}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {planning.morningSessions.map((session) => (
          <SessionRow
            key={`m-${session.startTime}-${session.athletes[0]?.athleteId ?? "x"}`}
            session={session}
            window="morning"
          />
        ))}
        {planning.endOfDaySession && (
          <SessionRow session={planning.endOfDaySession} window="end-of-day" />
        )}
      </div>
    </div>
  )
}

function SessionRow({
  session,
  window,
}: {
  session: DailySession
  window: "morning" | "end-of-day"
}) {
  const tp = useTranslations("planning")
  const Icon = window === "morning" ? Sunrise : Moon
  const windowLabel = window === "morning" ? tp("morning") : tp("endOfDay")

  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      {/* Row 1: window label + time on the left, type badge on the right.
          Stays on one line even on a 320px screen since these are short. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase text-muted-foreground sm:text-xs">
            {windowLabel}
          </span>
          <span className="text-sm font-medium">
            {session.startTime} – {session.endTime}
          </span>
        </div>
        {session.type === "collective" ? (
          <Badge className="shrink-0 bg-blue-600 text-white">
            <Users className="mr-1 h-3 w-3" />
            {tp("collective")} {session.athletes.length}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 border-blue-300 bg-blue-50 text-blue-700"
          >
            <User className="mr-1 h-3 w-3" />
            {tp("individual")}
          </Badge>
        )}
      </div>
      {/* Row 2: athletes + travel badges. Wraps onto multiple lines on
          mobile so the walking + driving pills don't truncate. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs text-muted-foreground">
          {session.athletes.map((a) => a.firstName).join(", ")}
        </span>
        <TravelModeBadges
          walkingMinutes={session.averageWalkingMinutes}
          drivingMinutes={session.averageDrivingMinutes}
          fallbackMinutes={
            session.averageTravelMinutes > 0
              ? session.averageTravelMinutes
              : undefined
          }
        />
      </div>
    </div>
  )
}
