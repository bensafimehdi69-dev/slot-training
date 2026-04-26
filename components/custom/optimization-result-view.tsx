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
import { CheckCircle, XCircle, Clock, Users, User, Loader2 } from "lucide-react"
import type { OptimizationResult, AthleteSlotInfo, IndividualSlot } from "@/lib/types/planning"

function TravelBadge({ minutes }: { minutes?: number }) {
  if (minutes === undefined || minutes === null) return null

  let colorClass = "bg-green-100 text-green-800 border-green-200"
  if (minutes >= 60) {
    colorClass = "bg-red-100 text-red-800 border-red-200"
  } else if (minutes >= 30) {
    colorClass = "bg-yellow-100 text-yellow-800 border-yellow-200"
  }

  return (
    <Badge variant="outline" className={colorClass}>
      <Clock className="h-3 w-3 mr-1" />
      {minutes} min
    </Badge>
  )
}

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
        <TravelBadge minutes={athlete.travelMinutes} />
      </td>
      <td className="py-2 px-3 text-sm text-muted-foreground">
        {athlete.departureTime || "-"}
      </td>
    </tr>
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
        <TravelBadge minutes={slot.travelMinutes} />
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
              <p className="text-sm font-medium">
                {bestSlot.averageTravelMinutes > 0 ? `${bestSlot.averageTravelMinutes} min` : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Athletes Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Détail par athlète</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
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
