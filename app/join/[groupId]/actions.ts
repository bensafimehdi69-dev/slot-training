"use server"

import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { createSessionCookie } from "@/lib/firebase/auth"
import { writeAthleteProfile } from "@/lib/server/profile-service"
import type { AddressWithCoords } from "@/lib/types/address"

export async function validateInviteToken(groupId: string, token: string) {
  // Find the group across all managers
  const managersSnapshot = await adminDb.collection("managers").get()

  for (const managerDoc of managersSnapshot.docs) {
    const groupDoc = await managerDoc.ref
      .collection("groups")
      .doc(groupId)
      .get()
    if (groupDoc.exists) {
      const data = groupDoc.data()!
      if (data.inviteToken !== token) {
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
  }

  return { error: "Groupe introuvable." }
}

export async function sendMagicLink(email: string) {
  const actionCodeSettings = {
    url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/join/verify`,
    handleCodeInApp: true,
  }

  try {
    const link = await adminAuth.generateSignInWithEmailLink(
      email,
      actionCodeSettings
    )

    // Send email via Resend
    const { Resend } = await import("resend")
    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: "Slot Training <onboarding@resend.dev>",
      to: email,
      subject: "Vérifiez votre email - Slot Training",
      html: `
        <h2>Bienvenue sur Slot Training !</h2>
        <p>Cliquez sur le bouton ci-dessous pour vérifier votre email et compléter votre profil :</p>
        <p><a href="${link}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Vérifier mon email</a></p>
        <p>Ce lien est valable pendant 1 heure.</p>
      `,
    })

    return { success: true }
  } catch (error) {
    console.error("[MAGIC LINK] Error:", error)
    return { error: "Impossible d'envoyer l'email. Veuillez réessayer." }
  }
}

export async function completeOnboarding(
  groupId: string,
  managerUid: string,
  idToken: string,
  data: {
    firstName: string
    lastName: string
    email: string
    homeAddress: AddressWithCoords
    schoolAddress: AddressWithCoords | null
    clubAddress: AddressWithCoords | null
    constraintsGrid: boolean[][]
  }
) {
  try {
    // Verify the ID token
    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    // Create session cookie
    await createSessionCookie(idToken)

    // Save athlete to the group
    await adminDb
      .collection("managers")
      .doc(managerUid)
      .collection("groups")
      .doc(groupId)
      .collection("athletes")
      .doc(uid)
      .set({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        hasProfile: true,
        gdprConsent: true,
        createdAt: new Date(),
      })

    // Save athlete profile (encrypted addresses). We pass uid explicitly
    // here because the session cookie set two lines above is not yet
    // readable inside this same request cycle — but we just verified the
    // ID token server-side, so the uid is trusted.
    await writeAthleteProfile(uid, {
      homeAddress: data.homeAddress,
      schoolAddress: data.schoolAddress,
      clubAddress: data.clubAddress,
      constraintsGrid: data.constraintsGrid,
    })

    return { success: true }
  } catch (error) {
    console.error("[ONBOARDING] Error:", error)
    return { error: "Une erreur est survenue. Veuillez réessayer." }
  }
}
