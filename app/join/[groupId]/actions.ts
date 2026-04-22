"use server"

import { z } from "zod"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { createSessionCookie } from "@/lib/firebase/auth"
import { writeAthleteProfile } from "@/lib/server/profile-service"
import { addressSchema } from "@/lib/types/address"

const firestoreId = z.string().min(1).max(128).regex(/^[^/]+$/, "Identifiant invalide.")
const inviteTokenSchema = z.string().min(8).max(128)
const emailSchema = z.string().trim().toLowerCase().email().max(254)

// Constraints grid must be 7 × 16 booleans — a malicious client could ship a
// 1000×1000 array that stalls the optimizer.
const constraintsGridSchema = z.array(z.array(z.boolean()).length(16)).length(7)

const onboardingDataSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  homeAddress: addressSchema,
  schoolAddress: addressSchema.nullable(),
  clubAddress: addressSchema.nullable(),
  constraintsGrid: constraintsGridSchema,
})

/**
 * Minimal HTML escape for user-supplied strings interpolated into email
 * templates. Keeps the single-file boundary — this helper is also defined
 * in `lib/utils/email.ts`; a shared util could be extracted in a later pass.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function validateInviteToken(groupId: string, token: string) {
  const parsedGroupId = firestoreId.safeParse(groupId)
  const parsedToken = inviteTokenSchema.safeParse(token)
  if (!parsedGroupId.success || !parsedToken.success) {
    return { error: "Lien d'invitation invalide." }
  }

  // TODO(sprint-2.5-commit-2): replace the O(N managers) scan with a read
  // from inviteIndex/{token} → {managerUid, groupId, expiresAt}.
  const managersSnapshot = await adminDb.collection("managers").get()

  for (const managerDoc of managersSnapshot.docs) {
    const groupDoc = await managerDoc.ref
      .collection("groups")
      .doc(parsedGroupId.data)
      .get()
    if (!groupDoc.exists) continue

    const data = groupDoc.data()!
    // Single generic error message across all failure modes — no oracle that
    // distinguishes "groupId doesn't exist" from "token doesn't match".
    if (data.inviteToken !== parsedToken.data) {
      return { error: "Lien d'invitation invalide." }
    }
    if (data.inviteTokenExpiresAt?.toDate() < new Date()) {
      return { error: "Ce lien d'invitation a expiré." }
    }
    return {
      data: {
        groupName: data.name as string,
        managerUid: managerDoc.id,
      },
    }
  }

  return { error: "Lien d'invitation invalide." }
}

export async function sendMagicLink(email: unknown) {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { error: "Email invalide." }

  const actionCodeSettings = {
    url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/join/verify`,
    handleCodeInApp: true,
  }

  try {
    const link = await adminAuth.generateSignInWithEmailLink(parsed.data, actionCodeSettings)

    const { Resend } = await import("resend")
    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: "Slot Training <onboarding@resend.dev>",
      to: parsed.data,
      subject: "Vérifiez votre email - Slot Training",
      html: `
        <h2>Bienvenue sur Slot Training !</h2>
        <p>Cliquez sur le bouton ci-dessous pour vérifier votre email et compléter votre profil :</p>
        <p><a href="${esc(link)}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Vérifier mon email</a></p>
        <p>Ce lien est valable pendant 1 heure.</p>
      `,
    })

    return { success: true }
  } catch (error) {
    console.error("[MAGIC LINK] sendMagicLink failed:", error instanceof Error ? error.message : "unknown")
    return { error: "Impossible d'envoyer l'email. Veuillez réessayer." }
  }
}

/**
 * Completes athlete onboarding. The critical authorization rule is that we
 * DO NOT accept `managerUid` from the client — we derive it by re-validating
 * the invite token server-side. Otherwise a malicious client (or a direct
 * POST bypassing the join form) could:
 *   - target any manager's group,
 *   - with any unexpired token knowledge,
 *   - and inject themselves as a group member.
 */
export async function completeOnboarding(
  groupId: string,
  inviteToken: string,
  idToken: string,
  rawData: unknown
) {
  try {
    const parsedGroupId = firestoreId.safeParse(groupId)
    if (!parsedGroupId.success) return { error: "Identifiant de groupe invalide." }

    const parsedData = onboardingDataSchema.safeParse(rawData)
    if (!parsedData.success) {
      return { error: parsedData.error.issues[0]?.message ?? "Données invalides." }
    }
    const data = parsedData.data

    // Re-validate the invite token server-side before trusting groupId / managerUid.
    const lookup = await validateInviteToken(parsedGroupId.data, inviteToken)
    if (lookup.error || !lookup.data) {
      return { error: lookup.error ?? "Lien d'invitation invalide." }
    }
    const managerUid = lookup.data.managerUid

    // uid comes from the server-verified ID token.
    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    await createSessionCookie(idToken)

    await adminDb
      .collection("managers").doc(managerUid)
      .collection("groups").doc(parsedGroupId.data)
      .collection("athletes").doc(uid)
      .set({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        hasProfile: true,
        gdprConsent: true,
        createdAt: new Date(),
      })

    // Session cookie set above is not readable inside the same request;
    // pass the verified uid explicitly to the internal helper.
    await writeAthleteProfile(uid, {
      homeAddress: data.homeAddress,
      schoolAddress: data.schoolAddress,
      clubAddress: data.clubAddress,
      constraintsGrid: data.constraintsGrid,
    })

    return { success: true }
  } catch (error) {
    console.error("[ONBOARDING] completeOnboarding failed:", error instanceof Error ? error.message : "unknown")
    return { error: "Une erreur est survenue. Veuillez réessayer." }
  }
}
