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
import { getGroups, createGroup, runScheduledCampaignTasks } from "./actions"
import { GroupCard } from "./_components/group-card"
import { NotificationsToggle } from "@/components/custom/notifications-toggle"
import type { Group } from "@/lib/types/group"

export default function DashboardPage() {
  const t = useTranslations("managerDashboard")
  const tc = useTranslations("common")
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  // Synchronous lock against double-submit (state propagates to disabled
  // one render late, so fast double-clicks would slip through).
  const creatingGroupRef = useRef(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [autoExpandDone, setAutoExpandDone] = useState(false)

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

  // Lazy cron: every time the manager opens the dashboard, run housekeeping.
  // Closes campaigns whose deadline has passed and emails non-responders 48h
  // before the deadline. Idempotent server-side via lastReminderSentAt.
  useEffect(() => {
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
        // Refresh so the newly-closed campaigns show their updated status.
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
  }, [loadGroups])

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
      } else {
        toast.success(t("groupCreated"))
        setCreateGroupOpen(false)
        loadGroups()
      }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationsToggle />
          <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
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
                <div className="space-y-2">
                  <Label htmlFor="name">{t("groupNameLabel")}</Label>
                  <Input id="name" name="name" placeholder={t("groupNamePlaceholder")} required />
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

      {groups.length === 0 ? (
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
