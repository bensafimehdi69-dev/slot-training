"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Clock,
  Users,
  User,
  Sunrise,
  Moon,
  CalendarDays,
} from "lucide-react"
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
          Planning par jour ({totalSessions} séance(s))
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
  const hasAny =
    planning.endOfDaySession !== null || planning.morningSessions.length > 0

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium">{planning.day}</p>
        {!hasAny && (
          <span className="text-xs italic text-muted-foreground">
            Aucune séance plannable
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
  const Icon = window === "morning" ? Sunrise : Moon
  const windowLabel = window === "morning" ? "Matin" : "Fin de journée"

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {windowLabel}
        </span>
        <span className="text-sm font-medium">
          {session.startTime} – {session.endTime}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {session.type === "collective" ? (
          <Badge className="bg-blue-600 text-white">
            <Users className="h-3 w-3 mr-1" />
            Collective {session.athletes.length}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
            <User className="h-3 w-3 mr-1" />
            Individuel
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {session.athletes.map((a) => a.firstName).join(", ")}
        </span>
        {session.averageTravelMinutes > 0 && (
          <Badge variant="outline" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            {session.averageTravelMinutes} min
          </Badge>
        )}
      </div>
    </div>
  )
}
