"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Clock, Loader2, Trash2, UserPlus } from "lucide-react"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  addGroupViewer,
  cancelGroupInvite,
  getGroupInvites,
  getGroupViewers,
  removeGroupViewer,
  type PendingStaffInvite,
} from "../actions"
import type { GroupViewer } from "@/lib/types/group"

interface ShareGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  groupName: string
}

/**
 * Owner-only dialog to manage read-only viewers of a group. Lists current
 * viewers (with avatar / name / email) and lets the owner add another by
 * email. The added person must already have a manager account; we surface
 * a clear error otherwise rather than silently emailing them an invite.
 */
export function ShareGroupDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
}: ShareGroupDialogProps) {
  const t = useTranslations("share")
  const tc = useTranslations("common")
  const [viewers, setViewers] = useState<GroupViewer[]>([])
  const [invites, setInvites] = useState<PendingStaffInvite[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState("")
  // Tracks which viewer's removal is in flight so we can disable just that
  // row while letting the rest stay interactive. Accepts UIDs (active
  // viewers) or invite tokens (pending invites) — they share the column.
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function refresh() {
    const [viewersRes, invitesRes] = await Promise.all([
      getGroupViewers(groupId),
      getGroupInvites(groupId),
    ])
    if (viewersRes.error) toast.error(viewersRes.error)
    else setViewers(viewersRes.data ?? [])
    if (invitesRes.error) toast.error(invitesRes.error)
    else setInvites(invitesRes.data ?? [])
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    refresh().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // refresh closes over groupId only; keeping it as a stable dep avoids
    // re-running on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupId])

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (adding) return
    setAdding(true)
    const result = await addGroupViewer(groupId, email)
    setAdding(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    if (result.added) {
      toast.success(t("added"))
    } else if (result.invited) {
      toast.success(t("invited", { email }))
    }
    setEmail("")
    await refresh()
  }

  async function handleRemove(viewer: GroupViewer) {
    if (removingId) return
    setRemovingId(viewer.uid)
    const result = await removeGroupViewer(groupId, viewer.uid)
    setRemovingId(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(t("removed"))
    setViewers((prev) => prev.filter((v) => v.uid !== viewer.uid))
  }

  async function handleCancelInvite(invite: PendingStaffInvite) {
    if (removingId) return
    setRemovingId(invite.token)
    const result = await cancelGroupInvite(groupId, invite.token)
    setRemovingId(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(t("inviteCancelled"))
    setInvites((prev) => prev.filter((i) => i.token !== invite.token))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: groupName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleAdd} className="space-y-2">
          <Label htmlFor="viewer-email">{t("emailLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="viewer-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
            />
            <Button type="submit" disabled={adding || !email}>
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              <span className="ml-1 hidden sm:inline">{t("add")}</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </form>

        <div className="space-y-2">
          <p className="text-sm font-medium">
            {t("currentViewers", { count: viewers.length + invites.length })}
          </p>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : viewers.length === 0 && invites.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">{t("none")}</p>
          ) : (
            <ul className="space-y-1.5">
              {viewers.map((viewer) => (
                <li
                  key={viewer.uid}
                  className="flex items-center gap-2 rounded-md border px-2 py-1.5"
                >
                  <Avatar
                    src={viewer.avatarUrl}
                    name={viewer.name || viewer.email}
                    size={28}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {viewer.name || viewer.email}
                    </span>
                    {viewer.name && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {viewer.email}
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={tc("delete")}
                    disabled={removingId === viewer.uid}
                    onClick={() => handleRemove(viewer)}
                  >
                    {removingId === viewer.uid ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </li>
              ))}
              {invites.map((invite) => (
                <li
                  key={invite.token}
                  className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/40 px-2 py-1.5"
                >
                  <Avatar name={invite.email} size={28} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{invite.email}</span>
                    <Badge
                      variant="outline"
                      className="mt-0.5 w-fit border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] leading-4 text-amber-800"
                    >
                      <Clock className="mr-0.5 h-2.5 w-2.5" />
                      {t("pendingBadge")}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={tc("cancel")}
                    disabled={removingId === invite.token}
                    onClick={() => handleCancelInvite(invite)}
                  >
                    {removingId === invite.token ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
