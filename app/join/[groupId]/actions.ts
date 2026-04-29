"use server"

import { z } from "zod"
import { getTranslations } from "next-intl/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { createSessionCookie } from "@/lib/firebase/auth"
import { writeAthleteProfile } from "@/lib/server/profile-service"
import { readInviteIndex, addAthleteMembership } from "@/lib/server/indexes"
import { addressSchema } from "@/lib/types/address"

const firestoreId = z.string().min(1).max(128).regex(/^[^/]+$/, "Identifiant invalide.")
const inviteTokenSchema = z.string().min(8).max(128)
const emailSchema = z.string().trim().toLowerCase().email().max(254)

// Constraints grid: 7 × 16 three-state cells (training / school / home).
// A malicious client could otherwise ship a 1000×1000 array that stalls the
// optimiser. The Lot 4 schema replaces the old boolean[][] payload.
const constraintCellSchema = z.enum(["training", "school", "home"])
const constraintsGridSchema = z
  .array(z.array(constraintCellSchema).length(16))
  .length(7)

const onboardingDataSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  homeAddress: addressSchema,
  schoolAddress: addressSchema.nullable(),
  clubAddress: addressSchema.nullable(),
  constraintsGrid: constraintsGridSchema,
})

export async function validateInviteToken(groupId: string, token: string) {
  const tErr = await getTranslations("serverErrors")
  const parsedGroupId = firestoreId.safeParse(groupId)
  const parsedToken = inviteTokenSchema.safeParse(token)
  if (!parsedGroupId.success || !parsedToken.success) {
    return { error: tErr("joinLinkInvalid") }
  }

  // O(1) lookup via the reverse index instead of scanning every manager.
  const index = await readInviteIndex(parsedToken.data)
  // Single generic error across all failure modes — never an oracle that
  // distinguishes "token exists, wrong group" from "token unknown".
  if (!index || index.groupId !== parsedGroupId.data) {
    return { error: tErr("joinLinkInvalid") }
  }
  if (index.expiresAt < new Date()) {
    return { error: tErr("joinLinkExpired") }
  }

  const groupDoc = await adminDb
    .collection("managers").doc(index.managerUid)
    .collection("groups").doc(parsedGroupId.data)
    .get()
  if (!groupDoc.exists) return { error: tErr("joinLinkInvalid") }

  return {
    data: {
      groupName: groupDoc.data()!.name as string,
      managerUid: index.managerUid,
    },
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
  const tErr = await getTranslations("serverErrors")
  try {
    const parsedGroupId = firestoreId.safeParse(groupId)
    if (!parsedGroupId.success) return { error: tErr("invalidGroupId") }

    const parsedData = onboardingDataSchema.safeParse(rawData)
    if (!parsedData.success) {
      return { error: parsedData.error.issues[0]?.message ?? tErr("invalidData") }
    }
    const data = parsedData.data

    // Re-validate the invite token server-side before trusting groupId / managerUid.
    const lookup = await validateInviteToken(parsedGroupId.data, inviteToken)
    if (lookup.error || !lookup.data) {
      return { error: lookup.error ?? tErr("joinLinkInvalid") }
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

    // Reverse index for the athlete-side "Mes campagnes" listing.
    await addAthleteMembership(uid, managerUid, parsedGroupId.data)

    return { success: true }
  } catch (error) {
    console.error("[ONBOARDING] completeOnboarding failed:", error instanceof Error ? error.message : "unknown")
    return { error: tErr("tryAgain") }
  }
}
