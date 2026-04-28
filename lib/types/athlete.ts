export interface Athlete {
  uid: string
  email: string
  firstName: string
  lastName: string
  hasProfile: boolean
  gdprConsent: boolean
  createdAt: Date
  avatarUrl?: string
}
