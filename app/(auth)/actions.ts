"use server"

import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { createSessionCookie, clearSession } from "@/lib/firebase/auth"
import { redirect } from "next/navigation"

export async function registerManager(formData: FormData) {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!name || !email || !password) {
    return { error: "Tous les champs sont requis." }
  }
  if (password.length < 6) {
    return { error: "Le mot de passe doit contenir au moins 6 caractères." }
  }

  try {
    const userRecord = await adminAuth.createUser({ email, password, displayName: name })
    await adminDb.collection("managers").doc(userRecord.uid).set({
      name,
      email,
      createdAt: new Date(),
    })
    return { success: true }
  } catch (error: unknown) {
    const firebaseError = error as { code?: string }
    if (firebaseError.code === "auth/email-already-exists") {
      return { error: "Cet email est déjà utilisé." }
    }
    return { error: "Une erreur est survenue. Veuillez réessayer." }
  }
}

export async function loginWithToken(idToken: string) {
  await createSessionCookie(idToken)
  redirect("/dashboard")
}

export async function logout() {
  await clearSession()
  redirect("/login")
}
