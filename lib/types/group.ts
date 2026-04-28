export type GroupRole = "owner" | "viewer"

export interface Group {
  id: string
  name: string
  createdAt: Date
  inviteToken: string
  inviteTokenExpiresAt: Date
  // Public avatar URL persisted in Firebase Storage. Optional — falls back
  // to initials in the UI when undefined.
  avatarUrl?: string
  // Manager UIDs that have read-only access to this group. Maintained by
  // addGroupViewer / removeGroupViewer, mirrored in the staffShares
  // reverse index for fast "shared with me" lookups.
  viewerUids?: string[]
  // Role of the current request's session relative to this group. NOT
  // stored in Firestore — populated by getGroups() based on which
  // collection the doc came from. Drives the read-only UI mode for
  // viewers (hides every action button).
  role: GroupRole
  // The owning manager's UID. For shared groups, it's the manager who
  // shared the group; for owned groups, it's the requester themselves.
  // Used by viewer-side action calls to address the right Firestore path.
  ownerUid: string
}

/**
 * Rich-info view of a single viewer (resolved manager doc), returned by
 * getGroupViewers. The Firestore group doc only stores `viewerUids: string[]`
 * — the name/email/avatar are joined server-side from `managers/{uid}`.
 */
export interface GroupViewer {
  uid: string
  name: string
  email: string
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
