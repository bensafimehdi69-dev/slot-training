"use server"

import { z } from "zod"
import { headers } from "next/headers"
import { getSession, requireManager } from "@/lib/firebase/auth"
import { saveFcmToken, deleteFcmToken } from "@/lib/server/push"

// FCM tokens are URL-safe base64 strings of typical length 152-200 chars.
// We allow up to 4096 to leave headroom for any future format change while
// still rejecting obviously bogus payloads.
const tokenSchema = z.string().min(20).max(4096)

/**
 * Saves the current user's FCM token. The role (athlete vs manager) is
 * inferred from the active session: if the caller is a manager, we store
 * the token under managers/{uid}, otherwise under athletes/{uid}. The same
 * UID may exist in both roles in theory but in practice never does.
 */
export async function registerFcmToken(token: string) {
  const parsed = tokenSchema.safeParse(token)
  if (!parsed.success) return { error: "Token invalide." }

  const manager = await requireManager()
  if (manager) {
    const ua = (await headers()).get("user-agent") ?? ""
    await saveFcmToken(manager.uid, "manager", parsed.data, ua)
    return { success: true }
  }

  const session = await getSession()
  if (!session) return { error: "Non authentifié." }
  const ua = (await headers()).get("user-agent") ?? ""
  await saveFcmToken(session.uid, "athlete", parsed.data, ua)
  return { success: true }
}

/**
 * Removes a token (e.g. user toggles notifications off). Best-effort —
 * a missing token isn't an error from the user's perspective.
 */
export async function unregisterFcmToken(token: string) {
  const parsed = tokenSchema.safeParse(token)
  if (!parsed.success) return { error: "Token invalide." }

  const manager = await requireManager()
  if (manager) {
    await deleteFcmToken(manager.uid, "manager", parsed.data)
    return { success: true }
  }

  const session = await getSession()
  if (!session) return { error: "Non authentifié." }
  await deleteFcmToken(session.uid, "athlete", parsed.data)
  return { success: true }
}
