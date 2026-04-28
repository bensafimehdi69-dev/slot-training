"use client"

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
import { CheckCircle, XCircle, Users, User, Loader2 } from "lucide-react"
import { DailyPlanningView } from "@/components/custom/daily-planning-view"
import { TravelModeBadges } from "@/components/custom/travel-mode-badges"
import type { OptimizationResult, AthleteSlotInfo, IndividualSlot } from "@/lib/types/planning"

function AthleteRow({ athlete }: { athlete: AthleteSlotInfo }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2 px-3 text-sm font-medium">
        {athlete.firstName} {athlete.lastName}
      </td>
      <td className="py-2 px-3">
        {athlete.available ? (
          <Badge className="bg-green-600 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Disponible
          </Badge>
        ) : (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Indisponible
          </Badge>
        )}
      </td>
      <td className="py-2 px-3 text-sm text-muted-foreground">
        {athlete.reason || "-"}
      </td>
      <td className="py-2 px-3">
        <TravelModeBadges
          walkingMinutes={athlete.walkingMinutes}
          drivingMinutes={athlete.drivingMinutes}
          fallbackMinutes={athlete.travelMinutes}
        />
      </td>
      <td className="py-2 px-3 text-sm text-muted-foreground">
        {athlete.departureTime || "-"}
      </td>
    </tr>
  )
}

/**
 * Mobile-friendly card variant of `AthleteRow`. The 5-column table doesn't
 * survive on a 360px screen — switching to a stacked layout below `sm` keeps
 * names, status and travel times all visible without horizontal scroll.
 */
function AthleteCard({ athlete }: { athlete: AthleteSlotInfo }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">
          {athlete.firstName} {athlete.lastName}
        </p>
        {athlete.available ? (
          <Badge className="bg-green-600 text-white">
            <CheckCircle className="mr-1 h-3 w-3" />
            Disponible
          </Badge>
        ) : (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Indisponible
          </Badge>
        )}
      </div>
      {athlete.reason && (
        <p className="mt-1 text-xs text-muted-foreground">{athlete.reason}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TravelModeBadges
          walkingMinutes={athlete.walkingMinutes}
          drivingMinutes={athlete.drivingMinutes}
          fallbackMinutes={athlete.travelMinutes}
        />
        {athlete.departureTime && (
          <span className="text-xs text-muted-foreground">
            Départ : {athlete.departureTime}
          </span>
        )}
      </div>
    </div>
  )
}

function IndividualSlotCard({ slot }: { slot: IndividualSlot }) {
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
            Raison : {slot.exclusionReason}
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
            Départ : {slot.departureTime}
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
  const bestSlot = result.bestSlot
  if (!bestSlot) return null

  const participationRate = bestSlot.totalCount > 0
    ? Math.round((bestSlot.availableCount / bestSlot.totalCount) * 100)
    : 0

  const allAthletes: AthleteSlotInfo[] = [
    ...bestSlot.availableAthletes,
    ...bestSlot.unavailableAthletes,
  ]

  return (
    <div className="space-y-4">
      {/* Per-day planning (new structure from Lot 3b). Falls back gracefully
          for legacy optimisations whose dailyPlannings array is empty. */}
      {result.dailyPlannings && result.dailyPlannings.length > 0 && (
        <DailyPlanningView dailyPlannings={result.dailyPlannings} />
      )}

      {/* Best Slot Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            Meilleur créneau collectif
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Jour</p>
              <p className="text-sm font-medium">{bestSlot.day}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Horaire</p>
              <p className="text-sm font-medium">{bestSlot.startTime} - {bestSlot.endTime}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Participation</p>
              <p className="text-sm font-medium">
                {bestSlot.availableCount}/{bestSlot.totalCount} = {participationRate}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Trajet moyen</p>
              <div className="text-sm font-medium">
                {bestSlot.averageWalkingMinutes !== undefined ||
                bestSlot.averageDrivingMinutes !== undefined ? (
                  <TravelModeBadges
                    walkingMinutes={bestSlot.averageWalkingMinutes}
                    drivingMinutes={bestSlot.averageDrivingMinutes}
                    fallbackMinutes={bestSlot.averageTravelMinutes}
                  />
                ) : bestSlot.averageTravelMinutes > 0 ? (
                  `${bestSlot.averageTravelMinutes} min`
                ) : (
                  "-"
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Athletes — table on ≥sm, stacked cards on mobile to keep all
          5 columns readable without horizontal scroll on a 360px screen. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Détail par athlète</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Nom</th>
                  <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Statut</th>
                  <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Raison</th>
                  <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Trajet</th>
                  <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Départ</th>
                </tr>
              </thead>
              <tbody>
                {allAthletes.map((athlete, index) => (
                  // Composite key: an athlete can theoretically appear in both
                  // available and unavailable lists if upstream data is dirty,
                  // so include the index to keep React keys unique.
                  <AthleteRow
                    key={`${athlete.athleteId}-${index}`}
                    athlete={athlete}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 p-3 sm:hidden">
            {allAthletes.map((athlete, index) => (
              <AthleteCard
                key={`${athlete.athleteId}-${index}`}
                athlete={athlete}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Individual Slots */}
      {result.individualSlots && result.individualSlots.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              Créneaux individuels ({result.individualSlots.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.individualSlots.map((slot) => (
              // The same athlete can have two individual sessions in a day
              // (morning + end-of-day) under the new per-day algorithm, so a
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

      {/* Validate / Reject Buttons */}
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
            Valider le planning
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isValidating || isRejecting}>
                {isRejecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Rejeter
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Rejeter ce planning ?</AlertDialogTitle>
                <AlertDialogDescription>
                  L&apos;optimisation sera supprimée et vous pourrez la
                  relancer. Aucun email ne sera envoyé aux athlètes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={onReject}>Rejeter</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {planningStatus === "validated" && (
        <Badge className="bg-green-600 text-white">
          <CheckCircle className="h-3 w-3 mr-1" />
          Planning validé
        </Badge>
      )}

      {planningStatus === "rejected" && (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Planning rejeté
        </Badge>
      )}
    </div>
  )
}
