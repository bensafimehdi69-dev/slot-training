// Firebase Cloud Messaging service worker — receives pushes when the PWA
// is closed or in the background. Must live at /firebase-messaging-sw.js
// (FCM looks for this exact path).
//
// We use the compat builds of firebase here because service workers run
// outside of bundlers and can't import ES modules from npm directly. The
// global `firebase` namespace they expose is the easiest cross-browser path.
importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js"
)
importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js"
)

// The service worker can't read process.env at runtime, so we inject the
// public Firebase config via a query string when registering it
// (registerServiceWorker in lib/firebase/messaging.ts). Falls back to
// reading from the registration scope's URL params.
const params = new URLSearchParams(self.location.search)
const firebaseConfig = {
  apiKey: params.get("apiKey") || "",
  authDomain: params.get("authDomain") || "",
  projectId: params.get("projectId") || "",
  messagingSenderId: params.get("messagingSenderId") || "",
  appId: params.get("appId") || "",
}

if (firebaseConfig.apiKey) {
  // eslint-disable-next-line no-undef
  firebase.initializeApp(firebaseConfig)
  // The messaging instance must be created so the SDK installs its internal
  // `push` event listener — without it, FCM cannot deliver pushes to this SW.
  // We deliberately do NOT register `onBackgroundMessage`: Chrome auto-renders
  // the notification from the payload's `notification` field, so adding our
  // own handler would surface a duplicate.
  // eslint-disable-next-line no-undef
  firebase.messaging()
}

// Take over from the previous SW as soon as we install. Combined with
// clients.claim() below, this means the new SW becomes the active one on the
// next page load instead of waiting for the user to close every tab/PWA —
// which would otherwise leave older SW versions running for a long time.
self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

// Click handler: bring the app to focus, or open a relevant URL if the
// payload provides one in `data.url`.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || "/"
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(targetUrl)
            return client.focus()
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
      })
  )
})
