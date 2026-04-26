import type { OptimizationResult } from "./planning"
import type { WeeklySchedule } from "./schedule"

export interface Campaign {
  id: string
  startDate: string
  endDate: string
  timeRangeStart: string
  timeRangeEnd: string
  trainingLocation: {
    formatted: string
    lat: number
    lng: number
  }
  // Coach + facility availability — 7 days × 16 hours of plain booleans.
  // true = the coach AND the room are available for that hour. Distinct
  // from the athlete's three-state ConstraintsGrid because the coach side
  // has no "school vs home" notion. Defaults to all-true for legacy
  // campaigns created before this field existed.
  availableSlots: boolean[][]
  status: "active" | "closed"
  deadline: Date
  createdAt: Date
  optimizationResult: OptimizationResult | null
  planningStatus: "pending" | "validated" | "rejected"
  planningStatusUpdatedAt: Date | null
}

export interface CampaignResponse {
  athleteId: string
  schedule: WeeklySchedule
  homeAddress: string
  schoolAddress: string
  constraints: string
  submittedAt: Date
}
