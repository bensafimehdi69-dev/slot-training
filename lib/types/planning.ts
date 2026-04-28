export interface SlotResult {
  day: string
  startTime: string
  endTime: string
  availableAthletes: AthleteSlotInfo[]
  unavailableAthletes: AthleteSlotInfo[]
  availableCount: number
  totalCount: number
  // averageTravelMinutes = average of the per-athlete worst-case (longest)
  // travel; the per-mode averages are surfaced for the session pill display.
  averageTravelMinutes: number
  averageWalkingMinutes?: number
  averageDrivingMinutes?: number
}

export interface AthleteSlotInfo {
  athleteId: string
  firstName: string
  lastName: string
  available: boolean
  reason?: string
  // travelMinutes = max(walkingMinutes, drivingMinutes), kept as the single
  // sortable / averageable number. The two mode-specific fields are surfaced
  // to the UI so the manager sees "à pied 25 min / en voiture 12 min" and
  // can pick a session that works for both kinds of athletes.
  travelMinutes?: number
  walkingMinutes?: number
  drivingMinutes?: number
  departureAddress?: string
  departureTime?: string
}

export interface IndividualSlot {
  athleteId: string
  firstName: string
  lastName: string
  day: string
  startTime: string
  endTime: string
  travelMinutes: number
  walkingMinutes?: number
  drivingMinutes?: number
  departureAddress: string
  departureTime: string
  exclusionReason: string
}

// New per-day structure (Lot 3b). Each day, the optimiser tries to schedule:
// - one end-of-day session (collective if ≥2 athletes, else individual),
// - one morning session: collective if ≥5 athletes, otherwise zero or more
//   individual sessions back-to-back for the athletes available in the morning.
// Per-athlete cap per day: at most one end-of-day appearance + one morning
// appearance.
export interface DailySession {
  // "collective": ≥2 athletes share the slot.
  // "individual": exactly one athlete in the slot.
  type: "collective" | "individual"
  startTime: string
  endTime: string
  durationMinutes: number
  athletes: AthleteSlotInfo[]
  averageTravelMinutes: number
  averageWalkingMinutes?: number
  averageDrivingMinutes?: number
}

export interface DailyPlanning {
  day: string // human label e.g. "Lundi"
  dayKey: string // raw key for matching, e.g. "lundi"
  endOfDaySession: DailySession | null
  // Zero sessions = no morning training that day.
  // One session of type "collective" = morning collective (≥5 athletes).
  // N sessions of type "individual" = back-to-back 1-on-1 sessions when
  // fewer than 5 athletes are available in the morning.
  morningSessions: DailySession[]
}

export interface OptimizationResult {
  // Source-of-truth, per-day plannings produced by the new algorithm.
  dailyPlannings: DailyPlanning[]
  // Legacy aggregated view kept so the existing dashboard UI still renders.
  // Derived from dailyPlannings: bestSlot = the highest-attendance end-of-day
  // collective across all days; individualSlots / allSlots are flattened
  // projections of the same per-day data.
  bestSlot: SlotResult
  individualSlots: IndividualSlot[]
  allSlots: SlotResult[]
  calculatedAt: Date
}
