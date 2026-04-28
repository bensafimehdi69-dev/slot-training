"use client"

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
import { CheckCircle, XCircle, Loader2 } from "lucide-react"
import { DailyPlanningView } from "@/components/custom/daily-planning-view"
import type { OptimizationResult } from "@/lib/types/planning"

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

  return (
    <div className="space-y-4">
      {result.dailyPlannings && result.dailyPlannings.length > 0 && (
        <DailyPlanningView dailyPlannings={result.dailyPlannings} />
      )}

      {result.debugMorning && result.debugMorning.length > 0 && (
        <details className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">
          <summary className="cursor-pointer font-medium text-amber-900">
            Diag matin (debug)
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-amber-900">
            {result.debugMorning.join("\n")}
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
