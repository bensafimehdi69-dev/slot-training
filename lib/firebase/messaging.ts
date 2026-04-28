"use client"

import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging"
import { app } from "./client"

// Required to authenticate with FCM's web push protocol. Generated in the
// Firebase console under Project settings → Cloud Messaging → Web Push
// certificates. Without it, getToken() throws.
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

// Build the same config we use in lib/firebase/client.ts and pass it as
// query params to the service worker — the SW can't read process.env, so
// it parses these from its own URL when it boots.
function serviceWorkerUrl(): string {
  const config = new URLSearchParams({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  })
  return `/firebase-messaging-sw.js?${config.toString()}`
}

export type NotificationSupportStatus =
  | "ready"
  | "unsupported"
  | "permission-denied"
  | "missing-vapid"

/**
 * Probes the runtime for everything we need to actually deliver a push:
 * - the browser must support the Push API + service workers,
 * - the OS-level permission must not be denied,
 * - we must have a VAPID key configured.
 */
export async function checkNotificationSupport(): Promise<NotificationSupportStatus> {
  if (typeof window === "undefined") return "unsupported"
  if (!("Notification" in window)) return "unsupported"
  if (!("serviceWorker" in navigator)) return "unsupported"
  const supported = await isSupported().catch(() => false)
  if (!supported) return "unsupported"
  if (!VAPID_KEY) return "missing-vapid"
  if (Notification.permission === "denied") return "permission-denied"
  return "ready"
}

/**
 * Asks the OS for permission, registers the FCM service worker, and
 * resolves to the FCM token. Caller should POST the token to the server
 * (saveAthleteFcmToken / saveManagerFcmToken) to persist it.
 *
 * Returns null on any non-fatal failure — the UI just stays in its current
 * state, and the user can retry. Fatal misconfigurations (missing VAPID
 * key, unsupported browser) should be caught upstream by checkNotificationSupport.
 */
export async function requestPushToken(): Promise<string | null> {
  if (!VAPID_KEY) return null
  const status = await checkNotificationSupport()
  if (status !== "ready") return null

  const permission = await Notification.requestPermission()
  if (permission !== "granted") return null

  // Register our SW under a deterministic scope. If a previous version is
  // already registered, the browser will reuse it.
  const registration = await navigator.serviceWorker.register(serviceWorkerUrl(), {
    scope: "/",
  })

  try {
    const messaging = getMessaging(app)
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    })
    return token || null
  } catch (error) {
    console.error("[FCM] getToken failed:", error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Show foreground messages as in-app toasts (the FCM SDK doesn't auto-show
 * notifications when the page is visible — the SW only fires for background
 * delivery). Caller passes a handler so we don't import the toast lib here.
 */
export function listenForForegroundMessages(
  handler: (payload: { title?: string; body?: string; url?: string }) => void
): () => void {
  if (typeof window === "undefined") return () => {}
  const messaging = getMessaging(app)
  return onMessage(messaging, (payload) => {
    // Server now ships data-only payloads (see lib/server/push.ts) so title
    // and body live under `data` rather than `notification`.
    const data = payload.data ?? {}
    handler({
      title: typeof data.title === "string" ? data.title : payload.notification?.title,
      body: typeof data.body === "string" ? data.body : payload.notification?.body,
      url: typeof data.url === "string" ? data.url : undefined,
    })
  })
}
