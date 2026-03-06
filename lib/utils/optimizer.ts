import type { WeeklySchedule, DayKey } from "@/lib/types/schedule"
import type { SlotResult, AthleteSlotInfo, IndividualSlot, OptimizationResult } from "@/lib/types/planning"
import type { AddressWithCoords } from "@/lib/types/address"
import { getDepartureInfo } from "./departure"
import { getTravelTime } from "./travel"

interface AthleteData {
  athleteId: string
  firstName: string
  lastName: string
  schedule: WeeklySchedule
  homeAddress: AddressWithCoords
  schoolAddress: AddressWithCoords | null
}

interface CampaignConfig {
  timeRangeStart: string
  timeRangeEnd: string
  trainingLocation: AddressWithCoords
  managerUid: string
  groupId: string
  campaignId: string
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

function generateTimeSlots(start: string, end: string, stepMinutes: number = 15): string[] {
  const slots: string[] = []
  const startMin = timeToMinutes(start)
  const endMin = timeToMinutes(end)
  for (let m = startMin; m < endMin; m += stepMinutes) {
    slots.push(minutesToTime(m))
  }
  return slots
}

const DAY_LABELS: Record<DayKey, string> = {
  lundi: "Lundi",
  mardi: "Mardi",
  mercredi: "Mercredi",
  jeudi: "Jeudi",
  vendredi: "Vendredi",
}

export async function optimizeSlots(
  athletes: AthleteData[],
  config: CampaignConfig
): Promise<OptimizationResult> {
  const timeSlots = generateTimeSlots(config.timeRangeStart, config.timeRangeEnd)
  const days: DayKey[] = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"]

  const results: SlotResult[] = []

  for (const day of days) {
    for (const slotStart of timeSlots) {
      const slotEnd = minutesToTime(timeToMinutes(slotStart) + 90)
      if (timeToMinutes(slotEnd) > timeToMinutes(config.timeRangeEnd)) continue

      const availableAthletes: AthleteSlotInfo[] = []
      const unavailableAthletes: AthleteSlotInfo[] = []

      for (const athlete of athletes) {
        const daySchedule = athlete.schedule[day] || []
        const departure = getDepartureInfo(
          daySchedule,
          slotStart,
          athlete.homeAddress,
          athlete.schoolAddress
        )

        if (departure.conflict) {
          unavailableAthletes.push({
            athleteId: athlete.athleteId,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            available: false,
            reason: departure.conflictReason,
          })
          continue
        }

        const travel = await getTravelTime(
          departure.address,
          config.trainingLocation,
          day,
          config.managerUid,
          config.groupId,
          config.campaignId
        )

        if (travel) {
          const availableFromMinutes = departure.availableFromTime
            ? timeToMinutes(departure.availableFromTime)
            : 0
          const arrivalMinutes = availableFromMinutes + travel.durationMinutes
          const slotStartMinutes = timeToMinutes(slotStart)

          if (arrivalMinutes > slotStartMinutes) {
            unavailableAthletes.push({
              athleteId: athlete.athleteId,
              firstName: athlete.firstName,
              lastName: athlete.lastName,
              available: false,
              reason: `Trajet ${travel.durationMinutes} min depuis ${departure.label} — arrivée estimée ${minutesToTime(arrivalMinutes)}`,
              travelMinutes: travel.durationMinutes,
            })
            continue
          }

          availableAthletes.push({
            athleteId: athlete.athleteId,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            available: true,
            travelMinutes: travel.durationMinutes,
            departureAddress: departure.label,
            departureTime: minutesToTime(slotStartMinutes - travel.durationMinutes),
          })
        } else {
          availableAthletes.push({
            athleteId: athlete.athleteId,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            available: true,
            departureAddress: departure.label,
          })
        }
      }

      const avgTravel =
        availableAthletes.length > 0
          ? availableAthletes.reduce((sum, a) => sum + (a.travelMinutes || 0), 0) / availableAthletes.length
          : 0

      results.push({
        day: DAY_LABELS[day],
        startTime: slotStart,
        endTime: slotEnd,
        availableAthletes,
        unavailableAthletes,
        availableCount: availableAthletes.length,
        totalCount: athletes.length,
        averageTravelMinutes: Math.round(avgTravel),
      })
    }
  }

  results.sort((a, b) => {
    if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount
    return a.averageTravelMinutes - b.averageTravelMinutes
  })

  const bestSlot = results[0]

  const individualSlots: IndividualSlot[] = []
  if (bestSlot) {
    for (const excluded of bestSlot.unavailableAthletes) {
      let bestIndividual: IndividualSlot | null = null

      for (const result of results) {
        const athleteInSlot = result.availableAthletes.find(
          (a) => a.athleteId === excluded.athleteId
        )
        if (athleteInSlot && (!bestIndividual || (athleteInSlot.travelMinutes || Infinity) < bestIndividual.travelMinutes)) {
          bestIndividual = {
            athleteId: excluded.athleteId,
            firstName: excluded.firstName,
            lastName: excluded.lastName,
            day: result.day,
            startTime: result.startTime,
            endTime: result.endTime,
            travelMinutes: athleteInSlot.travelMinutes || 0,
            departureAddress: athleteInSlot.departureAddress || "",
            departureTime: athleteInSlot.departureTime || "",
            exclusionReason: excluded.reason || "Indisponible pour le créneau collectif",
          }
        }
      }

      if (bestIndividual) {
        individualSlots.push(bestIndividual)
      }
    }
  }

  return {
    bestSlot,
    individualSlots,
    allSlots: results.slice(0, 5),
    calculatedAt: new Date(),
  }
}
