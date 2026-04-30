"use server"

import { z } from "zod"
import { getTranslations } from "next-intl/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { createSessionCookie } from "@/lib/firebase/auth"
import { writeAthleteProfile } from "@/lib/server/profile-service"
import {
  readInviteIndex,
  addAthleteMembership,
  readAthleteMemberships,
} from "@/lib/server/indexes"
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
  // Localised error messages — we resolve via getTranslations so the error
  // matches the visitor's locale (cookie or Accept-Language fallback) even
  // before they sign in. The "errors" namespace already covers
  // inviteInvalid / inviteExpired in fr / en / ar.
  const t = await getTranslations("errors")
  const parsedGroupId = firestoreId.safeParse(groupId)
  const parsedToken = inviteTokenSchema.safeParse(token)
  if (!parsedGroupId.success || !parsedToken.success) {
    return { error: t("inviteInvalid") }
  }

  // O(1) lookup via the reverse index instead of scanning every manager.
  const index = await readInviteIndex(parsedToken.data)
  // Single generic error across all failure modes — never an oracle that
  // distinguishes "token exists, wrong group" from "token unknown".
  if (!index || index.groupId !== parsedGroupId.data) {
    return { error: t("inviteInvalid") }
  }
  if (index.expiresAt < new Date()) {
    return { error: t("inviteExpired") }
  }

  const groupDoc = await adminDb
    .collection("managers").doc(index.managerUid)
    .collection("groups").doc(parsedGroupId.data)
    .get()
  if (!groupDoc.exists) return { error: t("inviteInvalid") }

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

    // Reverse index for the athlete-side "Mes campagnes" listing.
    await addAthleteMembership(uid, managerUid, parsedGroupId.data)

    return { success: true }
  } catch (error) {
    console.error("[ONBOARDING] completeOnboarding failed:", error instanceof Error ? error.message : "unknown")
    return { error: "Une erreur est survenue. Veuillez réessayer." }
  }
}

/**
 * Adds an already-onboarded athlete to a new group via an invite link.
 *
 * Used when the recipient's email already has a Firebase Auth account (e.g.
 * they're a member of another group on the same app). The full onboarding
 * flow (GDPR consent + name + addresses + schedule) is skipped because
 * those values already live in the global `athletes/{uid}` profile doc; we
 * just write a new per-group athlete entry and update the membership index.
 *
 * Identity rule: the firstName / lastName / email written to the new
 * per-group doc are sourced from one of the athlete's *existing* per-group
 * docs — never from the client. The client only proves possession of the
 * Firebase Auth account (via idToken) and of the invite token.
 */
export async function joinGroupAsExistingAthlete(
  groupId: string,
  inviteToken: string,
  idToken: string
) {
  try {
    const parsedGroupId = firestoreId.safeParse(groupId)
    if (!parsedGroupId.success) return { error: "Identifiant de groupe invalide." }

    const lookup = await validateInviteToken(parsedGroupId.data, inviteToken)
    if (lookup.error || !lookup.data) {
      return { error: lookup.error ?? "Lien d'invitation invalide." }
    }
    const managerUid = lookup.data.managerUid

    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    // Pull the existing identity from the athlete's current memberships.
    // We need at least one prior group so we can copy email/firstName/
    // lastName into the new per-group entry — without it we'd write an
    // incomplete record (the manager's roster would show "—").
    const memberships = await readAthleteMemberships(uid)
    if (memberships.length === 0) {
      return {
        error:
          "Compte sans profil. Inscris-toi via le lien d'invitation pour la première fois.",
      }
    }

    // Reject duplicate joins early so the manager doesn't see a flicker on
    // their dashboard. The membership write below is also idempotent.
    if (
      memberships.some(
        (m) => m.managerUid === managerUid && m.groupId === parsedGroupId.data
      )
    ) {
      return { error: "Tu fais déjà partie de ce groupe." }
    }

    // Read whichever existing per-group doc still exists (the membership
    // index can outlive a deleted group). Fall back to Firebase Auth email
    // and a blank display name so the join still succeeds for users whose
    // first group was hard-deleted.
    let firstName = ""
    let lastName = ""
    let email = ""
    for (const m of memberships) {
      const existing = await adminDb
        .collection("managers").doc(m.managerUid)
        .collection("groups").doc(m.groupId)
        .collection("athletes").doc(uid)
        .get()
      if (existing.exists) {
        const data = existing.data() ?? {}
        firstName = (data.firstName as string) || firstName
        lastName = (data.lastName as string) || lastName
        email = (data.email as string) || email
        if (firstName && email) break
      }
    }
    if (!email) {
      const userRecord = await adminAuth.getUser(uid).catch(() => null)
      email = userRecord?.email ?? ""
    }
    if (!email) {
      return { error: "Impossible de récupérer l'email du compte." }
    }

    await createSessionCookie(idToken)

    await adminDb
      .collection("managers").doc(managerUid)
      .collection("groups").doc(parsedGroupId.data)
      .collection("athletes").doc(uid)
      .set({
        email,
        firstName,
        lastName,
        hasProfile: true,
        gdprConsent: true,
        createdAt: new Date(),
      })

    await addAthleteMembership(uid, managerUid, parsedGroupId.data)

    return { success: true }
  } catch (error) {
    console.error(
      "[ONBOARDING] joinGroupAsExistingAthlete failed:",
      error instanceof Error ? error.message : "unknown"
    )
    return { error: "Une erreur est survenue. Veuillez réessayer." }
  }
}
