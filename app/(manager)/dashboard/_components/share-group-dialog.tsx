"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Loader2, Trash2, UserPlus } from "lucide-react"
import { Avatar } from "@/components/ui/avatar"
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
  getGroupViewers,
  removeGroupViewer,
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
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState("")
  // Tracks which viewer's removal is in flight so we can disable just that
  // row while letting the rest stay interactive.
  const [removingUid, setRemovingUid] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    getGroupViewers(groupId).then((result) => {
      if (cancelled) return
      if (result.error) toast.error(result.error)
      else setViewers(result.data ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
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
    toast.success(t("added"))
    setEmail("")
    // Refetch so the new viewer's avatar / name comes from the server
    // (don't risk denormalising client-side).
    const refreshed = await getGroupViewers(groupId)
    if (refreshed.data) setViewers(refreshed.data)
  }

  async function handleRemove(viewer: GroupViewer) {
    if (removingUid) return
    setRemovingUid(viewer.uid)
    const result = await removeGroupViewer(groupId, viewer.uid)
    setRemovingUid(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(t("removed"))
    setViewers((prev) => prev.filter((v) => v.uid !== viewer.uid))
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
            {t("currentViewers", { count: viewers.length })}
          </p>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : viewers.length === 0 ? (
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
                    disabled={removingUid === viewer.uid}
                    onClick={() => handleRemove(viewer)}
                  >
                    {removingUid === viewer.uid ? (
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
