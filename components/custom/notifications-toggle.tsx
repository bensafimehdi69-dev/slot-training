"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  checkNotificationSupport,
  listenForForegroundMessages,
  requestPushToken,
  type NotificationSupportStatus,
} from "@/lib/firebase/messaging"
import {
  registerFcmToken,
  unregisterFcmToken,
  clearUnreadCount,
} from "@/lib/actions/notifications"

// Tracks the current device's FCM token so we can re-send it to the server
// after a successful permission grant, and remove it when the user opts out.
// Stored in localStorage so a refresh doesn't re-prompt the user.
const STORAGE_KEY = "fcm-token"

interface Props {
  // Optional label override — defaults to a generic "Notifications" pill.
  className?: string
}

export function NotificationsToggle({ className }: Props) {
  const t = useTranslations("notifications")
  const [support, setSupport] = useState<NotificationSupportStatus | null>(null)
  const [enabled, setEnabled] = useState<boolean>(false)
  const [busy, setBusy] = useState(false)

  // Probe the runtime once on mount so we can render a sensible label
  // without flashing "loading" on every page that includes the toggle.
  useEffect(() => {
    let cancelled = false
    checkNotificationSupport().then((status) => {
      if (cancelled) return
      setSupport(status)
      if (status === "ready") {
        const cached = window.localStorage.getItem(STORAGE_KEY)
        setEnabled(Boolean(cached) && Notification.permission === "granted")
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Foreground messages don't auto-show notifications (the FCM SDK assumes
  // the app handles them in-app), so we surface them as toasts. Only set
  // up while the user has opted in — avoids spinning up the SDK otherwise.
  useEffect(() => {
    if (!enabled) return
    const unsubscribe = listenForForegroundMessages(({ title, body, url }) => {
      toast(title ?? "Slot Training", {
        description: body,
        action: url
          ? {
              label: t("open"),
              onClick: () => {
                window.location.href = url
              },
            }
          : undefined,
      })
      // Foreground delivery means the user is actively looking at the app —
      // the OS-level badge would otherwise stay stuck on the count from the
      // background path. Clearing it here keeps the badge in sync with what
      // the user has already seen as a toast.
      if (typeof navigator !== "undefined" && "clearAppBadge" in navigator) {
        ;(
          navigator as Navigator & { clearAppBadge?: () => Promise<void> }
        ).clearAppBadge?.().catch(() => {})
      }
      clearUnreadCount().catch(() => {})
    })
    return unsubscribe
  }, [enabled])

  async function handleEnable() {
    setBusy(true)
    try {
      const token = await requestPushToken()
      if (!token) {
        // Most common reason: user just denied at the OS prompt.
        toast.error(t("permissionDenied"))
        const status = await checkNotificationSupport()
        setSupport(status)
        return
      }
      const result = await registerFcmToken(token)
      if (result.error) {
        toast.error(result.error)
        return
      }
      window.localStorage.setItem(STORAGE_KEY, token)
      setEnabled(true)
      toast.success(t("enabledOnDevice"))
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setBusy(true)
    try {
      const token = window.localStorage.getItem(STORAGE_KEY)
      if (token) {
        await unregisterFcmToken(token)
        window.localStorage.removeItem(STORAGE_KEY)
      }
      setEnabled(false)
      toast.success(t("disabledOnDevice"))
    } finally {
      setBusy(false)
    }
  }

  if (support === null) {
    return null
  }

  if (support === "unsupported") {
    return (
      <div
        className={
          "inline-flex items-center gap-2 text-xs text-muted-foreground " +
          (className ?? "")
        }
      >
        <BellOff className="h-4 w-4" />
        {t("unsupported")}
      </div>
    )
  }

  if (support === "missing-vapid") {
    // Dev-time hint only; in prod this should never happen because the env
    // var is required for the deploy to make sense.
    return null
  }

  if (support === "permission-denied") {
    return (
      <div
        className={
          "inline-flex items-center gap-2 text-xs text-muted-foreground " +
          (className ?? "")
        }
      >
        <BellOff className="h-4 w-4" />
        {t("blocked")}
      </div>
    )
  }

  if (enabled) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleDisable}
        disabled={busy}
        className={className}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <BellRing className="mr-2 h-4 w-4 text-blue-600" />
        )}
        {t("enabled")}
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleEnable}
      disabled={busy}
      className={className}
    >
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Bell className="mr-2 h-4 w-4" />
      )}
      {t("enable")}
    </Button>
  )
}
