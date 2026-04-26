"use server"

import { z } from "zod"
import { getSession } from "@/lib/firebase/auth"
import {
  writeAthleteProfile,
  readAthleteProfile,
  type AthleteProfileInput,
} from "@/lib/server/profile-service"
import { addressSchema } from "@/lib/types/address"
import type { AthleteProfile } from "@/lib/types/profile"

// Constraints grid: 7 days × 16 time slots of three-state cells. A malicious
// client could otherwise ship a 1000×1000 array that stalls the optimizer.
const CONSTRAINTS_GRID_DAYS = 7
const CONSTRAINTS_GRID_SLOTS = 16
const constraintCellSchema = z.enum(["training", "school", "home"])
const constraintsGridSchema = z
  .array(z.array(constraintCellSchema).length(CONSTRAINTS_GRID_SLOTS))
  .length(CONSTRAINTS_GRID_DAYS)

const profileInputSchema = z.object({
  homeAddress: addressSchema.nullable(),
  schoolAddress: addressSchema.nullable(),
  clubAddress: addressSchema.nullable(),
  constraintsGrid: constraintsGridSchema,
})

/**
 * Public server action: saves the profile of the CURRENTLY AUTHENTICATED
 * athlete. The uid is derived from the verified session cookie — never
 * accept a uid argument from the caller (IDOR risk on a "use server" action).
 *
 * For trusted server-to-server callers (e.g. onboarding flow that just
 * verified an ID token), use `writeAthleteProfile` from
 * `lib/server/profile-service` directly with the verified uid.
 */
export async function saveAthleteProfile(data: AthleteProfileInput) {
  const session = await getSession()
  if (!session) return { error: "Non authentifié." }

  const parsed = profileInputSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données de profil invalides." }
  }

  await writeAthleteProfile(session.uid, parsed.data)
  return { success: true }
}

/**
 * Public server action: returns the profile of the CURRENTLY AUTHENTICATED
 * athlete. Same rule: uid is derived from the session, never from the caller.
 */
export async function getAthleteProfile(): Promise<AthleteProfile | null> {
  const session = await getSession()
  if (!session) return null
  return readAthleteProfile(session.uid)
}
