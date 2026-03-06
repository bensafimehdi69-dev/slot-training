export interface Group {
  id: string
  name: string
  createdAt: Date
  inviteToken: string
  inviteTokenExpiresAt: Date
}

export interface GroupAthlete {
  id: string
  email: string
  firstName: string
  lastName: string
  hasProfile: boolean
  gdprConsent: boolean
  createdAt: Date
}
