export interface ApiResponse<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface DistanceMatrixResult {
  durationMinutes: number
  distanceKm: number
}
