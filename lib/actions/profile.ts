"use server"

import { getSession } from "@/lib/firebase/auth"
import {
  writeAthleteProfile,
  readAthleteProfile,
  type AthleteProfileInput,
} from "@/lib/server/profile-service"
import type { AthleteProfile } from "@/lib/types/profile"

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

  await writeAthleteProfile(session.uid, data)
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
