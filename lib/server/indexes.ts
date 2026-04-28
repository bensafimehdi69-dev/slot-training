// Server-only reverse-index helpers.
//
// Problem: the manager-scoped Firestore layout (`managers/{uid}/groups/{id}`)
// forces any lookup by invite-token or campaign-id to scan every manager
// doc. That's an O(N managers × M groups) read per athlete-facing request,
// and a timing oracle for existence checks.
//
// Fix: maintain two top-level reverse-index collections, written from
// manager-side actions and read from athlete-side lookups. Admin SDK
// bypasses Firestore rules, and the rules deny client reads so athletes
// can't enumerate invite tokens.
//
// Schema:
//   inviteIndex/{token}       → { managerUid, groupId, expiresAt, createdAt }
//   campaignIndex/{campaignId} → { managerUid, groupId, createdAt }

import "server-only"

import { adminDb } from "@/lib/firebase/admin"

const INVITE_INDEX = "inviteIndex"
const CAMPAIGN_INDEX = "campaignIndex"
// athleteMemberships/{athleteUid} stores the (managerUid, groupId) tuples of
// every group an athlete belongs to, so the athlete-side dashboard can list
// "Mes campagnes" in a single read instead of scanning every manager. Like
// the other reverse-index collections, this is admin-only (deny-all client
// rules).
const ATHLETE_MEMBERSHIPS = "athleteMemberships"
// staffShares/{viewerUid} stores the (ownerUid, groupId) tuples of every
// group a manager has been granted read-only access to. Lets a viewer list
// "shared with me" groups in a single read instead of scanning every other
// manager's groups. Same admin-only access pattern as the other reverse
// indexes.
const STAFF_SHARES = "staffShares"
// staffInvites/{token} stores a pending email invite to share a group with
// someone who doesn't have a manager account yet. Each entry carries the
// owner + group + recipient email + expiry. Single-use: deleted on accept
// (or on the owner cancelling, or on the next stale-cleanup pass).
const STAFF_INVITES = "staffInvites"

export interface InviteIndexEntry {
  managerUid: string
  groupId: string
  expiresAt: Date
}

export interface CampaignIndexEntry {
  managerUid: string
  groupId: string
}

export async function writeInviteIndex(
  token: string,
  entry: { managerUid: string; groupId: string; expiresAt: Date }
): Promise<void> {
  await adminDb.collection(INVITE_INDEX).doc(token).set({
    managerUid: entry.managerUid,
    groupId: entry.groupId,
    expiresAt: entry.expiresAt,
    createdAt: new Date(),
  })
}

export async function deleteInviteIndex(token: string): Promise<void> {
  await adminDb.collection(INVITE_INDEX).doc(token).delete().catch(() => {})
}

export async function readInviteIndex(token: string): Promise<InviteIndexEntry | null> {
  const snap = await adminDb.collection(INVITE_INDEX).doc(token).get()
  if (!snap.exists) return null
  const data = snap.data()!
  const expiresAt = data.expiresAt?.toDate?.()
  if (!expiresAt || typeof data.managerUid !== "string" || typeof data.groupId !== "string") {
    return null
  }
  return { managerUid: data.managerUid, groupId: data.groupId, expiresAt }
}

export async function writeCampaignIndex(
  campaignId: string,
  entry: { managerUid: string; groupId: string }
): Promise<void> {
  await adminDb.collection(CAMPAIGN_INDEX).doc(campaignId).set({
    managerUid: entry.managerUid,
    groupId: entry.groupId,
    createdAt: new Date(),
  })
}

export async function deleteCampaignIndex(campaignId: string): Promise<void> {
  await adminDb.collection(CAMPAIGN_INDEX).doc(campaignId).delete().catch(() => {})
}

export async function readCampaignIndex(campaignId: string): Promise<CampaignIndexEntry | null> {
  const snap = await adminDb.collection(CAMPAIGN_INDEX).doc(campaignId).get()
  if (!snap.exists) return null
  const data = snap.data()!
  if (typeof data.managerUid !== "string" || typeof data.groupId !== "string") return null
  return { managerUid: data.managerUid, groupId: data.groupId }
}

export interface AthleteMembership {
  managerUid: string
  groupId: string
  joinedAt: Date
}

export async function readAthleteMemberships(
  athleteUid: string
): Promise<AthleteMembership[]> {
  const snap = await adminDb.collection(ATHLETE_MEMBERSHIPS).doc(athleteUid).get()
  if (!snap.exists) return []
  const data = snap.data()
  const groups = (data?.groups ?? []) as Array<{
    managerUid?: unknown
    groupId?: unknown
    joinedAt?: { toDate?: () => Date }
  }>
  const out: AthleteMembership[] = []
  for (const g of groups) {
    if (typeof g.managerUid !== "string" || typeof g.groupId !== "string") continue
    out.push({
      managerUid: g.managerUid,
      groupId: g.groupId,
      joinedAt: g.joinedAt?.toDate?.() ?? new Date(0),
    })
  }
  return out
}

/**
 * Idempotent: registers the athlete as a member of (managerUid, groupId) if
 * not already recorded. Used both at onboarding (\`completeOnboarding\`) and as
 * a self-heal on first access from \`getCampaignForAthlete\` so legacy athletes
 * who joined before this index existed get backfilled lazily.
 */
export async function addAthleteMembership(
  athleteUid: string,
  managerUid: string,
  groupId: string
): Promise<void> {
  const ref = adminDb.collection(ATHLETE_MEMBERSHIPS).doc(athleteUid)
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const current = (snap.exists ? (snap.data()?.groups ?? []) : []) as Array<{
      managerUid?: string
      groupId?: string
    }>
    const exists = current.some(
      (g) => g.managerUid === managerUid && g.groupId === groupId
    )
    if (exists) return
    const next = [
      ...current,
      { managerUid, groupId, joinedAt: new Date() },
    ]
    tx.set(ref, { groups: next }, { merge: true })
  })
}

/**
 * Batch-delete all reverse-index entries tied to a group before its parent
 * tree is recursivelyDelete'd. Top-level indexes are not children of the
 * group, so recursiveDelete won't touch them.
 */
export async function deleteIndexesForGroup(
  managerUid: string,
  groupId: string
): Promise<void> {
  const groupRef = adminDb
    .collection("managers").doc(managerUid)
    .collection("groups").doc(groupId)

  const groupSnap = await groupRef.get()
  const inviteToken = groupSnap.data()?.inviteToken as string | undefined
  const viewerUids = (groupSnap.data()?.viewerUids as string[] | undefined) ?? []

  const campaignsSnap = await groupRef.collection("campaigns").get()
  const campaignIds = campaignsSnap.docs.map((d) => d.id)

  // Firestore batched writes cap at 500 ops. A group with more than ~499
  // campaigns would overflow — split if it ever matters.
  const batch = adminDb.batch()
  if (inviteToken) batch.delete(adminDb.collection(INVITE_INDEX).doc(inviteToken))
  for (const id of campaignIds) batch.delete(adminDb.collection(CAMPAIGN_INDEX).doc(id))
  // Drop the share entry from every viewer's reverse index so a deleted
  // group no longer appears in their dashboard.
  for (const viewerUid of viewerUids) {
    batch.delete(
      adminDb
        .collection(STAFF_SHARES).doc(viewerUid)
        .collection("groups").doc(groupId)
    )
  }
  await batch.commit()
}

export interface StaffShare {
  ownerUid: string
  groupId: string
  addedAt: Date
}

/**
 * List every group a manager has been granted read-only access to. One
 * Firestore read per call regardless of how many owners shared with them.
 */
export async function readStaffShares(viewerUid: string): Promise<StaffShare[]> {
  const snap = await adminDb
    .collection(STAFF_SHARES).doc(viewerUid)
    .collection("groups")
    .get()
  return snap.docs.flatMap((doc) => {
    const data = doc.data()
    if (typeof data.ownerUid !== "string") return []
    return [{
      ownerUid: data.ownerUid,
      groupId: doc.id,
      addedAt: data.addedAt?.toDate?.() ?? new Date(0),
    }]
  })
}

/**
 * Add the (ownerUid, groupId) tuple to the viewer's share index. Idempotent
 * — safe to call from a re-share even if the viewer is already there.
 */
export async function writeStaffShare(
  viewerUid: string,
  ownerUid: string,
  groupId: string
): Promise<void> {
  await adminDb
    .collection(STAFF_SHARES).doc(viewerUid)
    .collection("groups").doc(groupId)
    .set({ ownerUid, addedAt: new Date() }, { merge: true })
}

export async function deleteStaffShare(
  viewerUid: string,
  groupId: string
): Promise<void> {
  await adminDb
    .collection(STAFF_SHARES).doc(viewerUid)
    .collection("groups").doc(groupId)
    .delete()
    .catch(() => {})
}

export interface StaffInvite {
  token: string
  email: string
  ownerUid: string
  groupId: string
  groupName: string
  createdAt: Date
  expiresAt: Date
}

export async function writeStaffInvite(invite: StaffInvite): Promise<void> {
  await adminDb.collection(STAFF_INVITES).doc(invite.token).set({
    email: invite.email,
    ownerUid: invite.ownerUid,
    groupId: invite.groupId,
    groupName: invite.groupName,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
  })
}

export async function readStaffInvite(token: string): Promise<StaffInvite | null> {
  const snap = await adminDb.collection(STAFF_INVITES).doc(token).get()
  if (!snap.exists) return null
  const data = snap.data()!
  if (
    typeof data.email !== "string" ||
    typeof data.ownerUid !== "string" ||
    typeof data.groupId !== "string"
  ) {
    return null
  }
  return {
    token,
    email: data.email,
    ownerUid: data.ownerUid,
    groupId: data.groupId,
    groupName: typeof data.groupName === "string" ? data.groupName : "",
    createdAt: data.createdAt?.toDate?.() ?? new Date(0),
    expiresAt: data.expiresAt?.toDate?.() ?? new Date(0),
  }
}

export async function deleteStaffInvite(token: string): Promise<void> {
  await adminDb.collection(STAFF_INVITES).doc(token).delete().catch(() => {})
}

/**
 * Pending invites for one (owner, group). Used by the share dialog to show
 * "envoyé, en attente" entries next to the active viewers.
 */
export async function listPendingInvitesForGroup(
  ownerUid: string,
  groupId: string
): Promise<StaffInvite[]> {
  const snap = await adminDb
    .collection(STAFF_INVITES)
    .where("ownerUid", "==", ownerUid)
    .where("groupId", "==", groupId)
    .get()
  return snap.docs.flatMap((doc) => {
    const data = doc.data()
    if (typeof data.email !== "string") return []
    return [{
      token: doc.id,
      email: data.email,
      ownerUid,
      groupId,
      groupName: typeof data.groupName === "string" ? data.groupName : "",
      createdAt: data.createdAt?.toDate?.() ?? new Date(0),
      expiresAt: data.expiresAt?.toDate?.() ?? new Date(0),
    }]
  })
}
