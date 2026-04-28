import "server-only"
import { getMessaging } from "firebase-admin/messaging"
import { adminDb } from "@/lib/firebase/admin"

export type PushUserRole = "athlete" | "manager"

export interface PushPayload {
  title: string
  body: string
  // Optional click-through URL — opened by the SW's notificationclick handler.
  url?: string
}

/**
 * Build the parent doc reference where this user's fcmTokens subcollection
 * lives. Athletes and managers are stored at different roots so we look up
 * each role separately.
 */
function tokensCollection(uid: string, role: PushUserRole) {
  const root = role === "athlete" ? "athletes" : "managers"
  return adminDb.collection(root).doc(uid).collection("fcmTokens")
}

/**
 * Register (or refresh) an FCM token for a user. Stores the user agent and
 * timestamp so we can later prune stale or shared-device tokens.
 *
 * The doc id is the token itself — Firestore caps doc ids at 1500 bytes
 * which is well above the FCM token length, and using the token as the id
 * makes registration idempotent (same browser on same device → same doc).
 */
export async function saveFcmToken(
  uid: string,
  role: PushUserRole,
  token: string,
  userAgent: string
): Promise<void> {
  if (!token) return
  await tokensCollection(uid, role).doc(token).set(
    {
      token,
      userAgent: userAgent.slice(0, 500),
      updatedAt: new Date(),
    },
    { merge: true }
  )
}

export async function deleteFcmToken(
  uid: string,
  role: PushUserRole,
  token: string
): Promise<void> {
  await tokensCollection(uid, role).doc(token).delete().catch(() => {
    // best-effort — caller doesn't need to know if the doc was already gone
  })
}

/**
 * Send a push to every device the user has registered. Silently no-ops
 * when the user has no tokens (e.g. they haven't opted in yet).
 *
 * Cleans up any token FCM rejects as `not-registered` or `invalid-argument`,
 * which happens when a browser uninstalls the SW or the user revokes the
 * permission — keeping these around forever would slowly grow the per-user
 * token list.
 */
export async function sendPushToUser(
  uid: string,
  role: PushUserRole,
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  const snap = await tokensCollection(uid, role).get()
  if (snap.empty) return { sent: 0, pruned: 0 }

  const tokens = snap.docs.map((d) => d.id)
  const messaging = getMessaging()

  // Data-only payload: no top-level `notification` and no `webpush.notification`.
  // When either is set, Chrome's FCM SW auto-displays the notif AND fires
  // `onBackgroundMessage` — the user ends up with two identical popups. By
  // shipping a data-only message, only our SW handler renders the notification,
  // so we get exactly one.
  const data: Record<string, string> = {
    title: payload.title,
    body: payload.body,
  }
  if (payload.url) data.url = payload.url

  const response = await messaging.sendEachForMulticast({
    tokens,
    data,
  })

  let pruned = 0
  await Promise.allSettled(
    response.responses.map(async (r, idx) => {
      if (r.success) return
      const code = r.error?.code ?? ""
      // These two codes mean the token will never work again — drop it.
      // Other failures (rate-limit, server error) are transient and the
      // token should stay registered for the next attempt.
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-argument"
      ) {
        pruned += 1
        await snap.docs[idx].ref.delete().catch(() => {})
      }
    })
  )

  return { sent: response.successCount, pruned }
}

/**
 * Multi-recipient convenience for fan-out scenarios (e.g. "notify every
 * athlete in the group"). Just loops sendPushToUser — Admin SDK already
 * batches per token, no point re-batching across users.
 */
export async function sendPushToUsers(
  uids: string[],
  role: PushUserRole,
  payload: PushPayload
): Promise<void> {
  await Promise.allSettled(
    uids.map((uid) => sendPushToUser(uid, role, payload))
  )
}
