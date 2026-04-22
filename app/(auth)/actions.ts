"use server"

import { z } from "zod"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { clearSession } from "@/lib/firebase/auth"
import { checkRateLimit, formatRetryAfter, getClientIp } from "@/lib/server/rate-limit"
import { redirect } from "next/navigation"

const registerSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(80),
  email: z.string().trim().toLowerCase().email("Email invalide.").max(254),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(256),
})

export async function registerManager(formData: FormData) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides." }
  }
  const { name, email, password } = parsed.data

  // Rate limit: 5 attempts per IP per 15 minutes. Prevents account-creation
  // spam and email enumeration by repeated `auth/email-already-exists` probes.
  const ip = await getClientIp()
  const rl = await checkRateLimit({
    key: `register:ip:${ip}`,
    max: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (!rl.allowed) {
    return { error: `Trop de tentatives. Réessayez dans ${formatRetryAfter(rl.retryAfterMs)}.` }
  }

  try {
    const userRecord = await adminAuth.createUser({ email, password, displayName: name })
    try {
      await adminDb.collection("managers").doc(userRecord.uid).set({
        name,
        email,
        createdAt: new Date(),
      })
    } catch (firestoreError) {
      // Roll back the auth user if the Firestore write fails — otherwise we
      // leave an orphaned account that can log in but has no manager profile.
      await adminAuth.deleteUser(userRecord.uid).catch(() => {})
      throw firestoreError
    }
    return { success: true }
  } catch (error: unknown) {
    const firebaseError = error as { code?: string }
    if (firebaseError.code === "auth/email-already-exists") {
      return { error: "Cet email est déjà utilisé." }
    }
    return { error: "Une erreur est survenue. Veuillez réessayer." }
  }
}

// Session creation goes through the `POST /api/auth/login` route — keeping
// a single code path avoids the cookie-flag drift the review flagged
// between the server action and the API route. Client callers hit that
// route with the Firebase idToken after signInWithEmailAndPassword /
// signInWithEmailLink on the client SDK.

export async function logout() {
  await clearSession()
  redirect("/login")
}
