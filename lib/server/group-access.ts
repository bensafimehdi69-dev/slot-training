import "server-only"
import { adminDb } from "@/lib/firebase/admin"

/**
 * Resolve the access path for the current manager-session caller against a
 * group: are they the owner, or a viewer (read-only)? Returns a structured
 * result that callers use both to decide whether to allow a write and to
 * address the correct Firestore path under the OWNER's manager doc.
 *
 * - When the caller owns the group, `ownerUid === requesterUid` and
 *   `role === "owner"`.
 * - When the caller is in `viewerUids`, `ownerUid` is the actual owner and
 *   `role === "viewer"`. Read-only actions should look up the group at
 *   `managers/{ownerUid}/groups/{groupId}`, not under the requester.
 *
 * Returns null if the requester has no access at all (group missing,
 * requester is neither owner nor viewer).
 */
export async function resolveGroupAccess(
  requesterUid: string,
  groupId: string
): Promise<{ ownerUid: string; role: "owner" | "viewer" } | null> {
  // Try owner path first — almost every dashboard request hits this branch.
  const ownedRef = adminDb
    .collection("managers").doc(requesterUid)
    .collection("groups").doc(groupId)
  const ownedSnap = await ownedRef.get()
  if (ownedSnap.exists) {
    return { ownerUid: requesterUid, role: "owner" }
  }

  // Fall back to the share index. One read per call; no scanning of every
  // manager's groups.
  const shareSnap = await adminDb
    .collection("staffShares").doc(requesterUid)
    .collection("groups").doc(groupId)
    .get()
  if (shareSnap.exists) {
    const ownerUid = shareSnap.data()?.ownerUid as string | undefined
    if (typeof ownerUid === "string") {
      // Defense-in-depth: confirm the share is still listed on the group
      // itself, in case the index drifted out of sync (deleted group, etc.).
      const sharedSnap = await adminDb
        .collection("managers").doc(ownerUid)
        .collection("groups").doc(groupId)
        .get()
      if (
        sharedSnap.exists &&
        Array.isArray(sharedSnap.data()?.viewerUids) &&
        (sharedSnap.data()?.viewerUids as string[]).includes(requesterUid)
      ) {
        return { ownerUid, role: "viewer" }
      }
    }
  }

  return null
}
