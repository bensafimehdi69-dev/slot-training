export interface SlotResult {
  day: string
  startTime: string
  endTime: string
  availableAthletes: AthleteSlotInfo[]
  unavailableAthletes: AthleteSlotInfo[]
  availableCount: number
  totalCount: number
  averageTravelMinutes: number
}

export interface AthleteSlotInfo {
  athleteId: string
  firstName: string
  lastName: string
  available: boolean
  reason?: string
  travelMinutes?: number
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
  departureAddress: string
  departureTime: string
  exclusionReason: string
}

export interface OptimizationResult {
  bestSlot: SlotResult
  individualSlots: IndividualSlot[]
  allSlots: SlotResult[]
  calculatedAt: Date
}
