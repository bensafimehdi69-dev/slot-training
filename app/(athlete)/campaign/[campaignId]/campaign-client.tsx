"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { submitCampaignResponse } from "./actions"
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
import { StepProgress } from "@/components/custom/step-progress"
import { ScheduleGrid } from "@/components/custom/schedule-grid"
import { AddressAutocompleteMap } from "@/components/custom/address-autocomplete-map"
import { TravelModeBadges } from "@/components/custom/travel-mode-badges"
import {
  Timer,
  CheckCircle,
  CalendarClock,
  MapPin,
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

interface AthleteSession {
  type: "collectif" | "individuel"
  dayKey: DayKey
  startTime: string
  endTime: string
  departureTime?: string
  travelMinutes?: number
  walkingMinutes?: number
  drivingMinutes?: number
  departureAddress?: string
}

interface CampaignClientPageProps {
  campaignId: string
  campaign: SerializedCampaign
  existingResponse: SerializedResponse | null
  profile: SerializedProfile | null
  athleteFirstName: string
  // Optional with a runtime fallback to [] so a stale HMR / cached page
  // doesn't throw "athleteSessions.length is undefined" when an older render
  // forgot to pass the new prop.
  athleteSessions?: AthleteSession[]
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
  athleteSessions,
  trainingLocation,
}: CampaignClientPageProps) {
  const sessions = athleteSessions ?? []

  // If planning is validated, show the planning view
  if (campaign.planningStatus === "validated") {
    return (
      <PlanningView
        campaignId={campaignId}
        campaign={campaign}
        athleteFirstName={athleteFirstName}
        athleteSessions={sessions}
        trainingLocation={trainingLocation}
      />
    )
  }

  // If campaign is closed (and we didn't already show the planning view above)
  if (campaign.status === "closed") {
    return <ClosedCampaignCard campaign={campaign} />
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

function ClosedCampaignCard({ campaign }: { campaign: SerializedCampaign }) {
  const t = useTranslations("athleteCampaign")
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mb-4 flex justify-center">
            <CalendarClock className="h-16 w-16 text-gray-400" />
          </div>
          <CardTitle>{t("campaignClosed")}</CardTitle>
          <CardDescription>{t("campaignClosedDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {t("period", { start: campaign.startDate, end: campaign.endDate })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("location", { location: campaign.trainingLocation.formatted })}
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href="/home">{t("backToHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function PlanningView({
  campaignId,
  campaign,
  athleteFirstName,
  athleteSessions,
  trainingLocation,
}: {
  campaignId: string
  campaign: SerializedCampaign
  athleteFirstName: string
  athleteSessions: AthleteSession[]
  trainingLocation: { formatted: string; lat: number; lng: number }
}) {
  const t = useTranslations("athleteCampaign")
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Timer className="h-10 w-10 text-blue-600" />
          </div>
          <CardTitle>{t("yourPlanning")}</CardTitle>
          <CardDescription>
            {t("yourPlanningSubtitle", {
              name: athleteFirstName,
              count: athleteSessions.length,
              start: campaign.startDate,
              end: campaign.endDate,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {athleteSessions.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-gray-500" />
                <h3 className="font-semibold text-gray-700">
                  {t("noSessionAssignedTitle")}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("noSessionAssignedDescription")}
              </p>
            </div>
          ) : (
            athleteSessions.map((session, index) => (
              <SessionCard
                key={`${session.dayKey}-${session.startTime}-${index}`}
                session={session}
              />
            ))
          )}

          <div className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t("trainingLocation")}</p>
              <p>{trainingLocation.formatted}</p>
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}

function SessionCard({ session }: { session: AthleteSession }) {
  const t = useTranslations("athleteCampaign")
  const tDays = useTranslations("days")
  const isCollective = session.type === "collectif"
  const cardClass = isCollective
    ? "border-blue-200 bg-blue-50"
    : "border-orange-200 bg-orange-50"
  const titleClass = isCollective ? "text-blue-800" : "text-orange-800"
  const iconClass = isCollective ? "text-blue-600" : "text-orange-600"
  const title = isCollective ? t("collectiveSlot") : t("individualSlot")

  return (
    <div className={`space-y-3 rounded-lg border p-4 ${cardClass}`}>
      <div className="flex items-center gap-2">
        <CheckCircle className={`h-5 w-5 ${iconClass}`} />
        <h3 className={`font-semibold ${titleClass}`}>{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">{t("day")}</p>
          <p className="font-medium">{tDays(session.dayKey)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("schedule")}</p>
          <p className="font-medium">
            {session.startTime} - {session.endTime}
          </p>
        </div>
        {session.departureTime && (
          <div>
            <p className="text-xs text-muted-foreground">{t("departureTime")}</p>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <p className="font-medium">{session.departureTime}</p>
            </div>
          </div>
        )}
        {(session.walkingMinutes !== undefined ||
          session.drivingMinutes !== undefined ||
          session.travelMinutes !== undefined) && (
          <div>
            <p className="text-xs text-muted-foreground">{t("estimatedTravel")}</p>
            <TravelModeBadges
              walkingMinutes={session.walkingMinutes}
              drivingMinutes={session.drivingMinutes}
              fallbackMinutes={session.travelMinutes}
            />
          </div>
        )}
      </div>
      {session.departureAddress && (
        <div className="flex items-start gap-2 text-sm">
          <Navigation className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">{t("departureAddress")}</p>
            <p>{session.departureAddress}</p>
          </div>
        </div>
      )}
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
  const t = useTranslations("athleteCampaign")
  const tHome = useTranslations("athleteHome")
  const tc = useTranslations("common")
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

  // Restore an in-progress draft from localStorage on mount. We only honour
  // it when no server-side response exists yet — otherwise the submitted
  // version wins. Mounting an effect for the read keeps this SSR-safe.
  const draftKey = `campaign-draft:${campaignId}`
  useEffect(() => {
    if (existingResponse) return
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(draftKey)
      if (!raw) return
      const draft = JSON.parse(raw) as Partial<{
        schedule: WeeklySchedule
        homeAddress: AddressWithCoords | null
        schoolAddress: AddressWithCoords | null
        constraints: string
      }>
      if (draft.schedule) setSchedule(draft.schedule)
      if (draft.homeAddress) setHomeAddress(draft.homeAddress)
      if (draft.schoolAddress !== undefined) setSchoolAddress(draft.schoolAddress)
      if (typeof draft.constraints === "string") setConstraints(draft.constraints)
    } catch {
      // Corrupt JSON or schema mismatch — ignore and let the user start fresh.
    }
    // Run once on mount; intentionally not reactive to the form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save the draft on every change so a tab close, an app switch on mobile,
  // or an accidental browser back-button never costs the athlete their
  // 3-step input. Cleared after a successful submit (see handleSubmit).
  useEffect(() => {
    if (existingResponse) return
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({ schedule, homeAddress, schoolAddress, constraints })
      )
    } catch {
      // Quota or private-mode error — silent.
    }
  }, [draftKey, existingResponse, schedule, homeAddress, schoolAddress, constraints])

  async function handleSubmit() {
    if (!homeAddress) {
      toast.error(tHome("homeAddressRequired"))
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

    toast.success(t("responseSentSuccess"))
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(draftKey)
      } catch {
        // ignore
      }
    }
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
            <CardTitle>{t("responseSent")}</CardTitle>
            <CardDescription>
              {t("responseSentMessage", { name: athleteFirstName })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 text-sm">
              <p className="text-muted-foreground">
                {t("period", { start: campaign.startDate, end: campaign.endDate })}
              </p>
              <p className="text-muted-foreground">
                {t("location", { location: campaign.trainingLocation.formatted })}
              </p>
              <p className="text-muted-foreground">
                {t("submittedOn", {
                  date: new Date(existingResponse.submittedAt).toLocaleString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </p>
            </div>

            {campaign.status === "active" && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowForm(true)}
              >
                {t("modifyResponse")}
              </Button>
            )}

            <Button asChild className="w-full">
              <Link href="/home">{t("backToHome")}</Link>
            </Button>
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
            <CardTitle>{t("responseSent")}</CardTitle>
            <CardDescription>{t("responseSavedShort")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full">
              <Link href="/home">{t("backToHome")}</Link>
            </Button>
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
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {campaign.startDate} → {campaign.endDate} &mdash;{" "}
            {campaign.trainingLocation.formatted}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StepProgress
            currentStep={step}
            totalSteps={3}
            label={
              step === 1
                ? t("step1")
                : step === 2
                  ? t("step2")
                  : t("step3")
            }
          />

          {/* Step 1: Schedule */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label className="mb-3 block text-base font-semibold">
                  {t("scheduleLabel")}
                </Label>
                <p className="mb-4 text-sm text-muted-foreground">
                  {t("scheduleHint")}
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
                {tc("continue")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Addresses */}
          {step === 2 && (
            <div className="space-y-4">
              <AddressAutocompleteMap
                label={tHome("homeAddress")}
                value={homeAddress}
                onChange={setHomeAddress}
                required
              />
              <AddressAutocompleteMap
                label={tHome("schoolAddress")}
                value={schoolAddress}
                onChange={setSchoolAddress}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {tc("back")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (!homeAddress) {
                      toast.error(tHome("homeAddressRequired"))
                      return
                    }
                    setStep(3)
                  }}
                >
                  {tc("continue")}
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
                  {t("constraintsLabel")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("constraintsHint")}
                </p>
                <Textarea
                  id="constraints"
                  value={constraints}
                  onChange={(e) =>
                    setConstraints(e.target.value.slice(0, 2000))
                  }
                  placeholder={t("constraintsPlaceholder")}
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
                  {tc("back")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? t("submitting") : t("submitResponse")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
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
