"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Plus, Users, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { getGroups, createGroup, runScheduledCampaignTasks, setGroupAvatar } from "./actions"
import { GroupCard } from "./_components/group-card"
import { NotificationsToggle } from "@/components/custom/notifications-toggle"
import { AvatarPicker } from "@/components/custom/avatar-picker"
import type { Group } from "@/lib/types/group"

export default function DashboardPage() {
  const t = useTranslations("managerDashboard")
  const tc = useTranslations("common")
  const tav = useTranslations("avatar")
  const terr = useTranslations("errors")
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  // Synchronous lock against double-submit (state propagates to disabled
  // one render late, so fast double-clicks would slip through).
  const creatingGroupRef = useRef(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [autoExpandDone, setAutoExpandDone] = useState(false)
  // Optional avatar picked in the New Group dialog. Held locally so it
  // survives until the create call returns the new group id, then uploaded
  // via setGroupAvatar.
  const [newGroupAvatar, setNewGroupAvatar] = useState<File | null>(null)
  const [groupNameDraft, setGroupNameDraft] = useState("")

  const loadGroups = useCallback(async () => {
    const result = await getGroups()
    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setGroups(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  // Lazy cron: housekeeping runs once per browser session. Closes campaigns
  // whose deadline has passed and emails non-responders 48h before the
  // deadline. Idempotent server-side via lastReminderSentAt, but skipping
  // the round-trip on subsequent dashboard visits within the same session
  // shaves one cold-start hit off every navigation.
  useEffect(() => {
    if (typeof window === "undefined") return
    const SESSION_KEY = "slot-training:scheduled-tasks-ran"
    if (window.sessionStorage.getItem(SESSION_KEY)) return
    window.sessionStorage.setItem(SESSION_KEY, "1")

    let cancelled = false
    runScheduledCampaignTasks().then((result) => {
      if (cancelled || !result.data) return
      const { closedCount, remindersSentCount } = result.data
      if (closedCount > 0) {
        toast.info(
          closedCount === 1
            ? t("autoFinalizedSingle")
            : t("autoFinalizedMany", { count: closedCount })
        )
        loadGroups()
      }
      if (remindersSentCount > 0) {
        toast.info(
          remindersSentCount === 1
            ? t("remindersSentSingle")
            : t("remindersSentMany", { count: remindersSentCount })
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [loadGroups, t])

  // Auto-expand the first group on initial load. Separated from loadGroups()
  // so we don't re-expand after every refresh (the previous implementation
  // used a deps-disabled useCallback to achieve the same thing; explicit is
  // clearer).
  useEffect(() => {
    if (autoExpandDone || groups.length === 0) return
    setExpandedGroups(new Set([groups[0].id]))
    setAutoExpandDone(true)
  }, [autoExpandDone, groups])

  const handleCreateGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (creatingGroupRef.current) return
    creatingGroupRef.current = true
    setCreatingGroup(true)
    try {
      const formData = new FormData(e.currentTarget)
      const result = await createGroup(formData)
      if (result.error) {
        toast.error(result.error)
        return
      }
      // Group created — if the manager picked a photo in the dialog, fire
      // the avatar upload now that we have the new id. Failure here is
      // surfaced as a toast but doesn't roll back the group creation; the
      // photo can be re-added later from the group card.
      if (result.data?.id && newGroupAvatar) {
        const avatarFormData = new FormData()
        avatarFormData.set("file", newGroupAvatar)
        const avatarResult = await setGroupAvatar(result.data.id, avatarFormData)
        if (avatarResult.error) {
          toast.error(terr("groupPhotoFailed", { error: avatarResult.error }))
        }
      }
      toast.success(t("groupCreated"))
      setCreateGroupOpen(false)
      setNewGroupAvatar(null)
      setGroupNameDraft("")
      loadGroups()
    } finally {
      creatingGroupRef.current = false
      setCreatingGroup(false)
    }
  }

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  // Always render the header immediately so the manager sees structure
  // (title, notifications toggle, "Nouveau groupe" button) without waiting
  // for the groups query — the loader is now scoped to the body where the
  // groups list will appear. On cold-start of the App Hosting container
  // this drops the perceived latency significantly compared to a full-page
  // spinner.
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationsToggle />
          <Dialog
            open={createGroupOpen}
            onOpenChange={(open) => {
              setCreateGroupOpen(open)
              // Discard the staged avatar + name draft when the dialog
              // closes without submitting, so the next open starts empty.
              if (!open) {
                setNewGroupAvatar(null)
                setGroupNameDraft("")
              }
            }}
          >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t("newGroup")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("createGroupTitle")}</DialogTitle>
              <DialogDescription>{t("createGroupDescription")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateGroup}>
              <div className="space-y-4 py-4">
                <div className="flex items-start gap-4">
                  <AvatarPicker
                    name={groupNameDraft || undefined}
                    size={64}
                    ariaLabel={tav("groupPhoto")}
                    onChange={setNewGroupAvatar}
                  />
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="name">{t("groupNameLabel")}</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder={t("groupNamePlaceholder")}
                      required
                      value={groupNameDraft}
                      onChange={(e) => setGroupNameDraft(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creatingGroup}>
                  {creatingGroup && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {tc("create")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">{t("noGroups")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              isExpanded={expandedGroups.has(group.id)}
              onToggle={() => toggleGroup(group.id)}
              onRefresh={loadGroups}
              onLocalRemove={(id) =>
                setGroups((prev) => prev.filter((g) => g.id !== id))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
