import type { OptimizationResult } from "./planning"
import type { ConstraintsGrid } from "./profile"
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
  // Coach + facility availability — same 7×16 grid shape as athlete profiles.
  // true = the coach AND the room are available for that hour. The optimizer
  // treats this as a hard constraint: a slot can only be picked if the
  // corresponding hour cell here is true. Defaults to all-true for legacy
  // campaigns created before this field existed.
  availableSlots: ConstraintsGrid
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
