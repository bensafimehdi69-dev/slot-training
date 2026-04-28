"use server"

import { z } from "zod"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { getSession } from "@/lib/firebase/auth"
import {
  readStaffInvite,
  deleteStaffInvite,
  writeStaffShare,
} from "@/lib/server/indexes"
import { revalidatePath } from "next/cache"

const tokenSchema = z.string().min(20).max(200)

export interface InvitePreview {
  email: string
  groupName: string
  inviterName: string
  alreadyHasAccount: boolean
}

/**
 * Public endpoint hit by the /invite-staff/[token] page on first render.
 * Returns the invite metadata + a hint about whether the email already has
 * a Firebase Auth user (so the page can show "log in" vs "create account").
 *
 * Returns null if the token is missing or expired so the page can render a
 * generic "invitation invalide ou expirée" state without leaking the reason.
 */
export async function getInvitePreview(
  token: string
): Promise<InvitePreview | null> {
  const parsed = tokenSchema.safeParse(token)
  if (!parsed.success) return null
  const invite = await readStaffInvite(parsed.data)
  if (!invite) return null
  if (invite.expiresAt.getTime() < Date.now()) {
    // Stale tokens are silently swept here — keeps the index clean and
    // avoids the page sitting on an unreusable invite.
    await deleteStaffInvite(parsed.data).catch(() => {})
    return null
  }
  // Look up the inviter's name (for the page header) + check whether the
  // recipient email already exists in Firebase Auth so the UI can prompt
  // sign-in vs sign-up.
  const inviterSnap = await adminDb.collection("managers").doc(invite.ownerUid).get()
  const inviterName =
    typeof inviterSnap.data()?.name === "string"
      ? (inviterSnap.data()?.name as string)
      : ""
  let alreadyHasAccount = false
  try {
    await adminAuth.getUserByEmail(invite.email)
    alreadyHasAccount = true
  } catch {
    // user-not-found
  }
  return {
    email: invite.email,
    groupName: invite.groupName,
    inviterName,
    alreadyHasAccount,
  }
}

/**
 * Called by the invite page AFTER the recipient is authenticated (either
 * after a fresh signup or a successful login). Verifies that the session's
 * email matches the invite's email, registers the manager profile if it
 * doesn't exist yet, then attaches the user as a viewer of the target
 * group and burns the token.
 *
 * The verification on session.email is the security pivot: even if someone
 * intercepts the URL, they can't accept the invite without authenticating
 * with the same email address it was sent to.
 */
export async function acceptStaffInvite(
  token: string
): Promise<{
  ownerUid?: string
  groupId?: string
  error?: string
}> {
  const session = await getSession()
  if (!session) return { error: "Non authentifié." }

  const parsed = tokenSchema.safeParse(token)
  if (!parsed.success) return { error: "Jeton invalide." }
  const invite = await readStaffInvite(parsed.data)
  if (!invite) return { error: "Invitation introuvable ou expirée." }
  if (invite.expiresAt.getTime() < Date.now()) {
    await deleteStaffInvite(parsed.data).catch(() => {})
    return { error: "Invitation expirée." }
  }

  // Pull the current user's email from Firebase Auth (more reliable than
  // session.email which is the cached idToken claim).
  const userRecord = await adminAuth.getUser(session.uid)
  const sessionEmail = userRecord.email?.toLowerCase()
  if (!sessionEmail || sessionEmail !== invite.email.toLowerCase()) {
    return {
      error: "Cette invitation a été envoyée à une autre adresse email.",
    }
  }

  // First-time accept may need to create the manager doc — a freshly
  // signed-up user from the invite page has a Firebase Auth user but no
  // entry under managers/{uid} yet. Idempotent set().
  const managerRef = adminDb.collection("managers").doc(session.uid)
  await managerRef.set(
    {
      email: sessionEmail,
      name: userRecord.displayName ?? "",
      createdAt: new Date(),
    },
    { merge: true }
  )

  // Add to the group's viewerUids + write the share index entry.
  const groupRef = adminDb
    .collection("managers").doc(invite.ownerUid)
    .collection("groups").doc(invite.groupId)
  const { FieldValue } = await import("firebase-admin/firestore")
  await groupRef.update({
    viewerUids: FieldValue.arrayUnion(session.uid),
  })
  await writeStaffShare(session.uid, invite.ownerUid, invite.groupId)
  await deleteStaffInvite(parsed.data)

  revalidatePath("/dashboard")
  return { ownerUid: invite.ownerUid, groupId: invite.groupId }
}
