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
  // eslint-disable-next-line no-undef
  const messaging = firebase.messaging()

  // Background message handler: shown when the PWA is not in focus. The
  // server sends DATA-ONLY messages (see lib/server/push.ts) so the browser
  // doesn't auto-display a notification — this handler is the only display
  // path, which keeps us at exactly one notification per push instead of the
  // duplicate Chrome shows when a top-level `notification` field is present.
  messaging.onBackgroundMessage((payload) => {
    const data = payload.data ?? {}
    const title = data.title || "Slot Training"
    const options = {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data,
    }
    self.registration.showNotification(title, options)
  })
}

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
