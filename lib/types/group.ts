export interface Group {
  id: string
  name: string
  createdAt: Date
  inviteToken: string
  inviteTokenExpiresAt: Date
  // Public avatar URL persisted in Firebase Storage. Optional — falls back
  // to initials in the UI when undefined.
  avatarUrl?: string
}

export interface GroupAthlete {
  id: string
  email: string
  firstName: string
  lastName: string
  hasProfile: boolean
  gdprConsent: boolean
  createdAt: Date
  avatarUrl?: string
}
