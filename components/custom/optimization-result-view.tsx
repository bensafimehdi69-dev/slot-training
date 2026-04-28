"use client"

import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { CheckCircle, XCircle, User, Loader2 } from "lucide-react"
import { DailyPlanningView } from "@/components/custom/daily-planning-view"
import { TravelModeBadges } from "@/components/custom/travel-mode-badges"
import type { OptimizationResult, IndividualSlot } from "@/lib/types/planning"

function IndividualSlotCard({ slot }: { slot: IndividualSlot }) {
  const tp = useTranslations("planning")
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 bg-blue-50/50 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <User className="h-4 w-4 shrink-0 text-blue-600" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {slot.firstName} {slot.lastName}
          </p>
          <p className="text-xs text-muted-foreground">
            {slot.day} {slot.startTime} - {slot.endTime}
          </p>
          <p className="text-xs text-muted-foreground">
            {tp("reason")}: {slot.exclusionReason}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <TravelModeBadges
          walkingMinutes={slot.walkingMinutes}
          drivingMinutes={slot.drivingMinutes}
          fallbackMinutes={slot.travelMinutes}
        />
        {slot.departureTime && (
          <span className="text-xs text-muted-foreground">
            {tp("departure")}: {slot.departureTime}
          </span>
        )}
      </div>
    </div>
  )
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

  return (
    <div className="space-y-4">
      {result.dailyPlannings && result.dailyPlannings.length > 0 && (
        <DailyPlanningView dailyPlannings={result.dailyPlannings} />
      )}

      {result.individualSlots && result.individualSlots.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              {tp("individualSlotsTitle", { count: result.individualSlots.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.individualSlots.map((slot) => (
              // The same athlete can have two individual sessions in a day
              // (morning + end-of-day) under the per-day algorithm, so a
              // bare athleteId is no longer unique — compose with day+startTime.
              <IndividualSlotCard
                key={`${slot.athleteId}-${slot.day}-${slot.startTime}`}
                slot={slot}
              />
            ))}
          </CardContent>
        </Card>
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
