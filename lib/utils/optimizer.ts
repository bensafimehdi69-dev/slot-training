import type { DayKey } from "@/lib/types/schedule"
import { dayKeys, dayLabels } from "@/lib/types/schedule"
import type { WeeklySchedule } from "@/lib/types/schedule"
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
  // Coach + facility availability — 7 days × 16 hours of booleans matching
  // the athlete schedule grid. true = a slot starting in this hour is allowed,
  // false = the coach or the room is unavailable so the optimiser must skip it.
  availableSlots: boolean[][]
  managerUid: string
  groupId: string
  campaignId: string
}

// Map a HH:MM start time to the hour bucket the availableSlots grid uses.
// The grid covers 07:00..22:00 in 1-hour buckets (16 cells), matching the
// athlete-side ConstraintsTapGrid. A slot starting at 08:30 falls in the
// 08:00 bucket. Slots starting outside 07–22 are treated as unavailable.
const AVAILABILITY_GRID_FIRST_HOUR = 7
const AVAILABILITY_GRID_HOURS = 16
const dayKeyToGridIndex: Record<DayKey, number> = {
  lundi: 0,
  mardi: 1,
  mercredi: 2,
  jeudi: 3,
  vendredi: 4,
}

function isSlotAllowed(grid: boolean[][], day: DayKey, slotStart: string): boolean {
  const dayIndex = dayKeyToGridIndex[day]
  const row = grid[dayIndex]
  if (!row) return true // grid malformed — be permissive rather than blocking everyone
  const hour = Number(slotStart.split(":")[0])
  const cellIndex = hour - AVAILABILITY_GRID_FIRST_HOUR
  if (cellIndex < 0 || cellIndex >= AVAILABILITY_GRID_HOURS) return false
  return row[cellIndex] !== false
}

// Business parameters — colocated so they're easy to tune.
const SLOT_DURATION_MINUTES = 90
const SLOT_STEP_MINUTES = 15
const MAPS_FAILURE_ABORT_RATIO = 0.5

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

function generateTimeSlots(start: string, end: string, stepMinutes = SLOT_STEP_MINUTES): string[] {
  const slots: string[] = []
  const startMin = timeToMinutes(start)
  const endMin = timeToMinutes(end)
  for (let m = startMin; m < endMin; m += stepMinutes) {
    slots.push(minutesToTime(m))
  }
  return slots
}

/**
 * Enumerates every (origin, day) pair the optimizer could ask the travel
 * service about, in one pass. Previously the optimizer issued these fetches
 * sequentially from inside a triple loop (O(days × slots × athletes)), which
 * blew past serverless timeouts as soon as the group grew past ~10 athletes.
 *
 * We pre-warm the Firestore travel cache with a single parallel fan-out, then
 * the main loop only hits the cache.
 */
function enumerateUniqueTravelPairs(
  athletes: AthleteData[]
): Array<{ origin: AddressWithCoords; day: DayKey }> {
  const seen = new Set<string>()
  const pairs: Array<{ origin: AddressWithCoords; day: DayKey }> = []

  for (const day of dayKeys) {
    for (const athlete of athletes) {
      // Home is always a possible departure point on any day.
      const homeKey = `${day}|${athlete.homeAddress.lat},${athlete.homeAddress.lng}`
      if (!seen.has(homeKey)) {
        seen.add(homeKey)
        pairs.push({ origin: athlete.homeAddress, day })
      }

      // School becomes a possible departure point if the athlete has a class
      // on that day and we know their school address.
      const daySchedule = athlete.schedule[day] || []
      if (daySchedule.length > 0 && athlete.schoolAddress) {
        const schoolKey = `${day}|${athlete.schoolAddress.lat},${athlete.schoolAddress.lng}`
        if (!seen.has(schoolKey)) {
          seen.add(schoolKey)
          pairs.push({ origin: athlete.schoolAddress, day })
        }
      }
    }
  }
  return pairs
}

export class MapsUnavailableError extends Error {
  constructor() {
    super("Google Maps a échoué sur la majorité des trajets. Optimisation annulée.")
    this.name = "MapsUnavailableError"
  }
}

export async function optimizeSlots(
  athletes: AthleteData[],
  config: CampaignConfig
): Promise<OptimizationResult> {
  const timeSlots = generateTimeSlots(config.timeRangeStart, config.timeRangeEnd)
  const days = dayKeys

  // Pre-warm the travel-time cache in parallel. Every inner call then hits
  // the cache and runs synchronously.
  const pairs = enumerateUniqueTravelPairs(athletes)
  if (pairs.length > 0) {
    const warmupResults = await Promise.all(
      pairs.map(({ origin, day }) =>
        getTravelTime(
          origin,
          config.trainingLocation,
          day,
          config.managerUid,
          config.groupId,
          config.campaignId
        )
      )
    )
    const failures = warmupResults.filter((r) => r === null).length
    if (failures / warmupResults.length > MAPS_FAILURE_ABORT_RATIO) {
      throw new MapsUnavailableError()
    }
  }

  const results: SlotResult[] = []

  for (const day of days) {
    for (const slotStart of timeSlots) {
      const slotEnd = minutesToTime(timeToMinutes(slotStart) + SLOT_DURATION_MINUTES)
      if (timeToMinutes(slotEnd) > timeToMinutes(config.timeRangeEnd)) continue

      // Hard filter: coach + facility must be available for this slot's hour.
      if (!isSlotAllowed(config.availableSlots, day, slotStart)) continue

      const availableAthletes: AthleteSlotInfo[] = []
      const unavailableAthletes: AthleteSlotInfo[] = []

      for (const athlete of athletes) {
        const daySchedule = athlete.schedule[day] || []
        const departure = getDepartureInfo(daySchedule, slotStart, athlete.homeAddress, athlete.schoolAddress)

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

        // Cache hit expected (warmed above). If it's a miss here the fetch
        // will still run but this path is rare.
        const travel = await getTravelTime(
          departure.address,
          config.trainingLocation,
          day,
          config.managerUid,
          config.groupId,
          config.campaignId
        )

        if (travel) {
          const availableFromMinutes = departure.availableFromTime ? timeToMinutes(departure.availableFromTime) : 0
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
        day: dayLabels[day],
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
        const athleteInSlot = result.availableAthletes.find((a) => a.athleteId === excluded.athleteId)
        if (
          athleteInSlot &&
          (!bestIndividual || (athleteInSlot.travelMinutes || Infinity) < bestIndividual.travelMinutes)
        ) {
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
