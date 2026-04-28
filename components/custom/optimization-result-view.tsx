"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { CheckCircle, XCircle, Loader2, Activity } from "lucide-react"
import { DailyPlanningView } from "@/components/custom/daily-planning-view"
import type { OptimizationResult } from "@/lib/types/planning"

interface AthleteVolumeRow {
  athleteId: string
  name: string
  collectiveAttended: number
  individualAttended: number
}

/**
 * Aggregate the week's plannings into one row per athlete:
 *   - collective sessions attended / total collective sessions in the week,
 *   - individual sessions attended (no "total" — these are personalised).
 * Used to surface each athlete's training volume so the manager spots
 * imbalance (e.g. one athlete with 0 collectives, one with twice the load).
 */
function computeAthleteVolume(result: OptimizationResult): {
  rows: AthleteVolumeRow[]
  totalCollective: number
} {
  const totalCollective = result.dailyPlannings.reduce((sum, p) => {
    let n = 0
    if (p.endOfDaySession?.type === "collective") n += 1
    for (const m of p.morningSessions) if (m.type === "collective") n += 1
    return sum + n
  }, 0)

  const byId = new Map<string, AthleteVolumeRow>()
  const seenName = (athleteId: string, fallbackName: string) => {
    let row = byId.get(athleteId)
    if (!row) {
      row = {
        athleteId,
        name: fallbackName,
        collectiveAttended: 0,
        individualAttended: 0,
      }
      byId.set(athleteId, row)
    }
    return row
  }

  for (const planning of result.dailyPlannings) {
    const sessions = [
      ...(planning.endOfDaySession ? [planning.endOfDaySession] : []),
      ...planning.morningSessions,
    ]
    for (const session of sessions) {
      for (const a of session.athletes) {
        const fullName = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.athleteId
        const row = seenName(a.athleteId, fullName)
        if (session.type === "collective") row.collectiveAttended += 1
        else row.individualAttended += 1
      }
    }
  }

  return {
    rows: Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "fr")
    ),
    totalCollective,
  }
}

interface OptimizationResultViewProps {
  result: OptimizationResult
  planningStatus: string
  onValidate: () => void
  onReject: () => void
  isValidating: boolean
  isRejecting: boolean
}

export function OptimizationResultView({
  result,
  planningStatus,
  onValidate,
  onReject,
  isValidating,
  isRejecting,
}: OptimizationResultViewProps) {
  const tp = useTranslations("planning")
  const tcamp = useTranslations("campaigns")
  const tc = useTranslations("common")
  // The legacy "best collective slot" summary and the per-bestSlot athletes
  // table were removed: the per-day view below is the source of truth — there
  // is one best slot *per day*, not a single one across the week.

  const volume = useMemo(() => computeAthleteVolume(result), [result])

  return (
    <div className="space-y-4">
      {result.dailyPlannings && result.dailyPlannings.length > 0 && (
        <DailyPlanningView dailyPlannings={result.dailyPlannings} />
      )}

      {volume.rows.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Activity className="h-4 w-4 text-blue-600" />
            {tp("trainingVolumeTitle")}
          </h3>
          <ul className="space-y-1">
            {volume.rows.map((row) => (
              <li
                key={row.athleteId}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm"
              >
                <span className="truncate font-medium">{row.name}</span>
                <span className="flex shrink-0 gap-1.5 text-xs">
                  <Badge
                    variant="outline"
                    className="border-blue-200 bg-blue-50 px-1.5 py-0 leading-4 text-blue-700"
                  >
                    {tp("trainingVolumeCollective", {
                      attended: row.collectiveAttended,
                      total: volume.totalCollective,
                    })}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-orange-200 bg-orange-50 px-1.5 py-0 leading-4 text-orange-700"
                  >
                    {tp("trainingVolumeIndividual", { count: row.individualAttended })}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.debug && result.debug.length > 0 && (
        <details className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">
          <summary className="cursor-pointer font-medium text-amber-900">
            Diag algo (trace décision)
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-amber-900">
            {result.debug.join("\n")}
          </pre>
        </details>
      )}

      <Separator />

      {planningStatus === "pending" && (
        <div className="flex gap-3">
          <Button
            onClick={onValidate}
            disabled={isValidating || isRejecting}
            className="bg-green-600 hover:bg-green-700"
          >
            {isValidating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            {tp("validate")}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isValidating || isRejecting}>
                {isRejecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                {tp("reject")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tp("rejectTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{tp("rejectDescription")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={onReject}>{tp("reject")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {planningStatus === "validated" && (
        <Badge className="bg-green-600 text-white">
          <CheckCircle className="h-3 w-3 mr-1" />
          {tcamp("statusValidated")}
        </Badge>
      )}

      {planningStatus === "rejected" && (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          {tcamp("statusRejected")}
        </Badge>
      )}
    </div>
  )
}
