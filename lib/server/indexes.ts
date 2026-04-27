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

  const campaignsSnap = await groupRef.collection("campaigns").get()
  const campaignIds = campaignsSnap.docs.map((d) => d.id)

  // Firestore batched writes cap at 500 ops. A group with more than ~499
  // campaigns would overflow — split if it ever matters.
  const batch = adminDb.batch()
  if (inviteToken) batch.delete(adminDb.collection(INVITE_INDEX).doc(inviteToken))
  for (const id of campaignIds) batch.delete(adminDb.collection(CAMPAIGN_INDEX).doc(id))
  await batch.commit()
}
