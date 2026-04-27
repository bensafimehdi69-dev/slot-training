"use server"

import { z } from "zod"
import { createSessionCookie } from "@/lib/firebase/auth"

const idTokenSchema = z.string().min(20).max(8192)

export async function createAthleteSession(idToken: unknown) {
  const parsed = idTokenSchema.safeParse(idToken)
  if (!parsed.success) return { error: "Jeton invalide." }
  try {
    await createSessionCookie(parsed.data)
    return { success: true }
  } catch (error) {
    console.error(
      "[ATHLETE LOGIN] createAthleteSession failed:",
      error instanceof Error ? error.message : "unknown",
    )
    return { error: "Erreur lors de la connexion." }
  }
}
