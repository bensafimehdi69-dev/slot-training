"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import {
  Users,
  User,
  Sunrise,
  Moon,
  CalendarDays,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { TravelModeBadges } from "@/components/custom/travel-mode-badges"
import type {
  AthleteSlotInfo,
  DailyPlanning,
  DailySession,
} from "@/lib/types/planning"

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
    // Section, not Card — the planning view already lives inside the
    // CampaignCard's CardContent, so wrapping it in another Card stacked
    // a third 24px padding on each side and squeezed the day blocks. Plain
    // section reclaims the horizontal space for the slots themselves.
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <CalendarDays className="h-4 w-4 text-blue-600" />
        {tp("perDayTitle", { count: totalSessions })}
      </h3>
      <div className="space-y-2">
        {dailyPlannings.map((planning) => (
          <DayBlock key={planning.dayKey} planning={planning} />
        ))}
      </div>
    </section>
  )
}

function DayBlock({ planning }: { planning: DailyPlanning }) {
  const tp = useTranslations("planning")
  const hasAny =
    planning.endOfDaySession !== null || planning.morningSessions.length > 0

  return (
    <div className="rounded-lg border p-2 sm:p-3">
      <div className="mb-1.5 flex items-center justify-between">
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
  // One athlete's detail can be expanded at a time. Per-athlete travel data
  // replaces the previous group-average pills, since an average isn't useful
  // when athletes' commute times can differ a lot.
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      {/* One-line layout: icon, time, badge and the athlete chips all share
          the same row and only wrap when the viewport gets too narrow. The
          window label ("Matin"/"Fin de journée") was dropped — the icon
          conveys the same information without consuming horizontal space. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-label={windowLabel}
        />
        <span className="text-sm font-medium whitespace-nowrap">
          {session.startTime}–{session.endTime}
        </span>
        {session.type === "collective" ? (
          <Badge className="shrink-0 bg-blue-600 px-1.5 py-0 text-[10px] leading-4 text-white">
            <Users className="mr-0.5 h-2.5 w-2.5" />
            {tp("collective")} {session.athletes.length}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 border-blue-300 bg-blue-50 px-1.5 py-0 text-[10px] leading-4 text-blue-700"
          >
            <User className="mr-0.5 h-2.5 w-2.5" />
            {tp("individual")} {session.athletes.length}
          </Badge>
        )}
        {session.athletes.map((athlete) => {
          const isOpen = expandedId === athlete.athleteId
          return (
            <button
              key={athlete.athleteId}
              type="button"
              onClick={() =>
                setExpandedId((cur) =>
                  cur === athlete.athleteId ? null : athlete.athleteId
                )
              }
              className="inline-flex items-center gap-0.5 rounded-md border border-transparent bg-background/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:border-blue-300 hover:bg-blue-50"
              aria-expanded={isOpen}
              aria-controls={`detail-${session.startTime}-${athlete.athleteId}`}
            >
              {isOpen ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
              {athlete.firstName}
            </button>
          )
        })}
      </div>
      {expandedId &&
        (() => {
          const a = session.athletes.find((x) => x.athleteId === expandedId)
          if (!a) return null
          return (
            <AthleteDetail
              id={`detail-${session.startTime}-${a.athleteId}`}
              athlete={a}
            />
          )
        })()}
    </div>
  )
}

function AthleteDetail({ id, athlete }: { id: string; athlete: AthleteSlotInfo }) {
  const tp = useTranslations("planning")
  return (
    <div
      id={id}
      className="mt-2 rounded-md border bg-background px-3 py-2 text-xs"
    >
      <p className="text-sm font-medium">
        {athlete.firstName} {athlete.lastName}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <TravelModeBadges
          walkingMinutes={athlete.walkingMinutes}
          drivingMinutes={athlete.drivingMinutes}
          fallbackMinutes={athlete.travelMinutes}
        />
        {athlete.departureAddress && (
          <span className="text-muted-foreground">
            {tp("departure")}: {athlete.departureAddress}
          </span>
        )}
        {athlete.departureTime && (
          <span className="text-muted-foreground">
            {athlete.departureTime}
          </span>
        )}
      </div>
    </div>
  )
}
