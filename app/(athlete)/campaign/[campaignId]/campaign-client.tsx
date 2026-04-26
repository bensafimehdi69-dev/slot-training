"use client"

import { useState } from "react"
import { submitCampaignResponse, deleteAthleteData } from "./actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
import { StepProgress } from "@/components/custom/step-progress"
import { ScheduleGrid } from "@/components/custom/schedule-grid"
import { AddressAutocompleteMap } from "@/components/custom/address-autocomplete-map"
import { TravelTimeBadge } from "@/components/custom/travel-time-badge"
import {
  Timer,
  CheckCircle,
  CalendarClock,
  MapPin,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Clock,
  Navigation,
  AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"
import type { AddressWithCoords } from "@/lib/types/address"
import type { WeeklySchedule, DayKey, ScheduleSlot } from "@/lib/types/schedule"
import type { ConstraintsGrid } from "@/lib/types/profile"
import { dayKeys } from "@/lib/types/schedule"

// Serializable versions of types (dates as strings)
interface SerializedCampaign {
  id: string
  startDate: string
  endDate: string
  timeRangeStart: string
  timeRangeEnd: string
  trainingLocation: { formatted: string; lat: number; lng: number }
  status: "active" | "closed"
  deadline: string
  createdAt: string
  optimizationResult: {
    bestSlot: {
      day: string
      startTime: string
      endTime: string
      availableAthletes: {
        athleteId: string
        firstName: string
        lastName: string
        available: boolean
        reason?: string
        travelMinutes?: number
        departureAddress?: string
        departureTime?: string
      }[]
      unavailableAthletes: {
        athleteId: string
        firstName: string
        lastName: string
        available: boolean
        reason?: string
        travelMinutes?: number
        departureAddress?: string
        departureTime?: string
      }[]
      availableCount: number
      totalCount: number
      averageTravelMinutes: number
    }
    individualSlots: {
      athleteId: string
      firstName: string
      lastName: string
      day: string
      startTime: string
      endTime: string
      travelMinutes: number
      departureAddress: string
      departureTime: string
      exclusionReason: string
    }[]
    allSlots: unknown[]
    calculatedAt: string
  } | null
  planningStatus: "pending" | "validated" | "rejected"
  planningStatusUpdatedAt: string | null
}

interface SerializedResponse {
  athleteId: string
  schedule: WeeklySchedule
  homeAddress: string
  schoolAddress: string
  constraints: string
  submittedAt: string
}

interface SerializedProfile {
  homeAddress: AddressWithCoords | null
  schoolAddress: AddressWithCoords | null
  clubAddress: AddressWithCoords | null
  constraintsGrid: ConstraintsGrid
  updatedAt: string
}

interface AthleteSlotData {
  type: "collectif" | "individuel" | "aucun"
  day?: string
  startTime?: string
  endTime?: string
  departureTime?: string
  travelMinutes?: number
  departureAddress?: string
  trainingLocation?: string
  exclusionReason?: string
}

interface CampaignClientPageProps {
  campaignId: string
  campaign: SerializedCampaign
  existingResponse: SerializedResponse | null
  profile: SerializedProfile | null
  athleteFirstName: string
  athleteSlot: AthleteSlotData | null
  trainingLocation: { formatted: string; lat: number; lng: number }
}

function createEmptySchedule(): WeeklySchedule {
  const schedule: Partial<WeeklySchedule> = {}
  for (const day of dayKeys) {
    schedule[day] = []
  }
  return schedule as WeeklySchedule
}

export function CampaignClientPage({
  campaignId,
  campaign,
  existingResponse,
  profile,
  athleteFirstName,
  athleteSlot,
  trainingLocation,
}: CampaignClientPageProps) {
  // If planning is validated, show the planning view
  if (campaign.planningStatus === "validated" && athleteSlot) {
    return (
      <PlanningView
        campaignId={campaignId}
        campaign={campaign}
        athleteFirstName={athleteFirstName}
        athleteSlot={athleteSlot}
        trainingLocation={trainingLocation}
      />
    )
  }

  // If campaign is closed, show closed message
  if (campaign.status === "closed" && campaign.planningStatus !== "validated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mb-4 flex justify-center">
              <CalendarClock className="h-16 w-16 text-gray-400" />
            </div>
            <CardTitle>Campagne cloturee</CardTitle>
            <CardDescription>
              Cette campagne n&apos;accepte plus de réponses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Periode : {campaign.startDate} au {campaign.endDate}
            </p>
            <p className="text-sm text-muted-foreground">
              Lieu : {campaign.trainingLocation.formatted}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show the form or submitted confirmation
  return (
    <CampaignForm
      campaignId={campaignId}
      campaign={campaign}
      existingResponse={existingResponse}
      profile={profile}
      athleteFirstName={athleteFirstName}
    />
  )
}

// Planning View Component (Task 21)
function PlanningView({
  campaignId,
  campaign,
  athleteFirstName,
  athleteSlot,
  trainingLocation,
}: {
  campaignId: string
  campaign: SerializedCampaign
  athleteFirstName: string
  athleteSlot: AthleteSlotData
  trainingLocation: { formatted: string; lat: number; lng: number }
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Timer className="h-10 w-10 text-blue-600" />
          </div>
          <CardTitle>Votre planning</CardTitle>
          <CardDescription>
            Bonjour {athleteFirstName}, voici votre créneau pour la période du{" "}
            {campaign.startDate} au {campaign.endDate}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {athleteSlot.type === "collectif" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold text-blue-800">
                    Creneau collectif
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Jour</p>
                    <p className="font-medium">{athleteSlot.day}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Horaire</p>
                    <p className="font-medium">
                      {athleteSlot.startTime} - {athleteSlot.endTime}
                    </p>
                  </div>
                  {athleteSlot.departureTime && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Heure de depart
                      </p>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <p className="font-medium">
                          {athleteSlot.departureTime}
                        </p>
                      </div>
                    </div>
                  )}
                  {athleteSlot.travelMinutes !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Trajet estime
                      </p>
                      <TravelTimeBadge minutes={athleteSlot.travelMinutes} />
                    </div>
                  )}
                </div>
              </div>

              {athleteSlot.departureAddress && (
                <div className="flex items-start gap-2 text-sm">
                  <Navigation className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Adresse de depart
                    </p>
                    <p>{athleteSlot.departureAddress}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    Lieu d&apos;entraînement
                  </p>
                  <p>{trainingLocation.formatted}</p>
                </div>
              </div>
            </div>
          )}

          {athleteSlot.type === "individuel" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-orange-600" />
                  <h3 className="font-semibold text-orange-800">
                    Creneau individuel
                  </h3>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Un creneau individuel vous a ete attribue car le creneau
                  collectif ne correspondait pas à vos disponibilités.
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Jour</p>
                    <p className="font-medium">{athleteSlot.day}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Horaire</p>
                    <p className="font-medium">
                      {athleteSlot.startTime} - {athleteSlot.endTime}
                    </p>
                  </div>
                  {athleteSlot.departureTime && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Heure de depart
                      </p>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <p className="font-medium">
                          {athleteSlot.departureTime}
                        </p>
                      </div>
                    </div>
                  )}
                  {athleteSlot.travelMinutes !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Trajet estime
                      </p>
                      <TravelTimeBadge minutes={athleteSlot.travelMinutes} />
                    </div>
                  )}
                </div>
              </div>

              {athleteSlot.departureAddress && (
                <div className="flex items-start gap-2 text-sm">
                  <Navigation className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Adresse de depart
                    </p>
                    <p>{athleteSlot.departureAddress}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    Lieu d&apos;entraînement
                  </p>
                  <p>{trainingLocation.formatted}</p>
                </div>
              </div>
            </div>
          )}

          {athleteSlot.type === "aucun" && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-gray-500" />
                <h3 className="font-semibold text-gray-700">
                  Aucun creneau attribue
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Malheureusement, aucun creneau compatible n&apos;a pu etre
                trouve pour cette periode. Contactez votre entraineur pour plus
                d&apos;informations.
              </p>
            </div>
          )}

          <Separator />

          <DeleteDataSection campaignId={campaignId} />
        </CardContent>
      </Card>
    </div>
  )
}

// Campaign Form Component
function CampaignForm({
  campaignId,
  campaign,
  existingResponse,
  profile,
  athleteFirstName,
}: {
  campaignId: string
  campaign: SerializedCampaign
  existingResponse: SerializedResponse | null
  profile: SerializedProfile | null
  athleteFirstName: string
}) {
  const [showForm, setShowForm] = useState(!existingResponse)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Form state - pre-fill from profile if available
  const [schedule, setSchedule] = useState<WeeklySchedule>(() => {
    if (existingResponse) return existingResponse.schedule
    // Convert profile constraintsGrid to WeeklySchedule if available
    if (profile?.constraintsGrid) {
      return constraintsGridToSchedule(
        profile.constraintsGrid,
        campaign.timeRangeStart,
        campaign.timeRangeEnd
      )
    }
    return createEmptySchedule()
  })

  const [homeAddress, setHomeAddress] = useState<AddressWithCoords | null>(
    profile?.homeAddress || null
  )
  const [schoolAddress, setSchoolAddress] = useState<AddressWithCoords | null>(
    profile?.schoolAddress || null
  )
  const [constraints, setConstraints] = useState(
    existingResponse?.constraints || ""
  )

  async function handleSubmit() {
    if (!homeAddress) {
      toast.error("L'adresse de domicile est requise.")
      return
    }

    setLoading(true)
    const result = await submitCampaignResponse(campaignId, {
      schedule,
      homeAddress,
      schoolAddress,
      constraints,
    })

    if (result.error) {
      toast.error(result.error)
      setLoading(false)
      return
    }

    toast.success("Réponse envoyée avec succès !")
    setShowForm(false)
    setLoading(false)
  }

  // Already submitted view
  if (!showForm && existingResponse) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mb-4 flex justify-center">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
            <CardTitle>Réponse envoyée</CardTitle>
            <CardDescription>
              Bonjour {athleteFirstName}, votre réponse à la campagne a bien été
              enregistrée.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 text-sm">
              <p className="text-muted-foreground">
                Période : {campaign.startDate} au {campaign.endDate}
              </p>
              <p className="text-muted-foreground">
                Lieu : {campaign.trainingLocation.formatted}
              </p>
              <p className="text-muted-foreground">
                Envoyé le :{" "}
                {new Date(existingResponse.submittedAt).toLocaleDateString(
                  "fr-FR",
                  {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
              </p>
            </div>

            {campaign.status === "active" && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowForm(true)}
              >
                Modifier ma réponse
              </Button>
            )}

            <Separator />

            <DeleteDataSection campaignId={campaignId} />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Not submitted but just submitted
  if (!showForm && !existingResponse) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <div className="mb-4 flex justify-center">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
            <CardTitle>Réponse envoyée !</CardTitle>
            <CardDescription>
              Votre réponse a été enregistrée. Vous recevrez un email lorsque le
              planning sera validé.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteDataSection campaignId={campaignId} />
          </CardContent>
        </Card>
      </div>
    )
  }

  // 3-step form
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Timer className="h-10 w-10 text-blue-600" />
          </div>
          <CardTitle>Campagne d&apos;entraînement</CardTitle>
          <CardDescription>
            {campaign.startDate} au {campaign.endDate} &mdash;{" "}
            {campaign.trainingLocation.formatted}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StepProgress
            currentStep={step}
            totalSteps={3}
            label={
              step === 1
                ? "Emploi du temps"
                : step === 2
                  ? "Adresses"
                  : "Contraintes"
            }
          />

          {/* Step 1: Schedule */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label className="mb-3 block text-base font-semibold">
                  Votre emploi du temps
                </Label>
                <p className="mb-4 text-sm text-muted-foreground">
                  Indiquez vos heures de cours en cliquant sur les cases
                  correspondantes.
                </p>
                <ScheduleGrid
                  value={schedule}
                  onChange={setSchedule}
                  timeRangeStart="07:00"
                  timeRangeEnd="22:00"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => setStep(2)}
              >
                Continuer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Addresses */}
          {step === 2 && (
            <div className="space-y-4">
              <AddressAutocompleteMap
                label="Adresse de domicile"
                value={homeAddress}
                onChange={setHomeAddress}
                required
              />
              <AddressAutocompleteMap
                label="Adresse du lieu d'etudes (optionnel)"
                value={schoolAddress}
                onChange={setSchoolAddress}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Retour
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (!homeAddress) {
                      toast.error("L'adresse de domicile est requise.")
                      return
                    }
                    setStep(3)
                  }}
                >
                  Continuer
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Constraints */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="constraints" className="text-base font-semibold">
                  Contraintes particulieres
                </Label>
                <p className="text-sm text-muted-foreground">
                  Signalez toute contrainte qui pourrait affecter votre
                  disponibilité (blessure, examen, transport, etc.)
                </p>
                <Textarea
                  id="constraints"
                  value={constraints}
                  onChange={(e) =>
                    setConstraints(e.target.value.slice(0, 2000))
                  }
                  placeholder="Ex: je n'ai pas de voiture le mercredi..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {constraints.length}/2000
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Retour
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? "Envoi en cours..." : "Envoyer ma réponse"}
                </Button>
              </div>
            </div>
          )}

          <Separator className="my-4" />

          <DeleteDataSection campaignId={campaignId} />
        </CardContent>
      </Card>
    </div>
  )
}

// GDPR Delete Section
function DeleteDataSection({ campaignId }: { campaignId: string }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteAthleteData(campaignId)

    if (result.error) {
      toast.error(result.error)
      setDeleting(false)
      setShowConfirm(false)
      return
    }

    setDeleted(true)
    setDeleting(false)
    toast.success("Vos donnees ont ete supprimees.")
  }

  if (deleted) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center text-sm text-green-800">
        Vos donnees ont ete supprimees. Vous pouvez fermer cette page.
      </div>
    )
  }

  return (
    <div className="pt-2">
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer mes donnees
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer toutes vos donnees ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irreversible. Toutes vos donnees seront
              definitivement supprimees :
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
            <li>Adresses (domicile, études)</li>
            <li>Emploi du temps</li>
            <li>Contraintes specifiques</li>
            <li>Votre compte utilisateur</li>
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Suppression..." : "Confirmer la suppression"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Convert the profile's 7×16 ConstraintsGrid into a WeeklySchedule for the
// campaign response form. The grid spans Sun..Sat with one row per day and
// 16 cells starting at 07:00; the campaign response only uses Mon–Fri and
// the campaign's time range. Lot 4 changed cells from boolean to a
// three-state string ("training" | "school" | "home") and the schedule now
// stores ScheduleSlot { hour, location } instead of plain strings.
function constraintsGridToSchedule(
  grid: ConstraintsGrid,
  timeRangeStart: string,
  timeRangeEnd: string
): WeeklySchedule {
  const schedule = createEmptySchedule()
  const startHour = parseInt(timeRangeStart.split(":")[0], 10)
  const endHour = parseInt(timeRangeEnd.split(":")[0], 10)

  // ConstraintsTapGrid / AthleteAvailabilityGrid row order is Dim(0)…Sam(6),
  // which matches the new dayKeys order exactly.
  const GRID_START_HOUR = 7
  const dayMapping: DayKey[] = [
    "dimanche",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
  ]

  for (let dayIdx = 0; dayIdx < dayMapping.length; dayIdx++) {
    const day = dayMapping[dayIdx]
    const gridRow = grid[dayIdx]
    if (!gridRow) continue
    const slots: ScheduleSlot[] = []
    for (let h = startHour; h < endHour; h++) {
      const cellIdx = h - GRID_START_HOUR
      if (cellIdx < 0 || cellIdx >= gridRow.length) continue
      const cell = gridRow[cellIdx]
      if (cell === "school" || cell === "home") {
        slots.push({ hour: `${h.toString().padStart(2, "0")}:00`, location: cell })
      }
    }
    schedule[day] = slots
  }

  return schedule
}
