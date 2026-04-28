"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Copy, RefreshCw, Trash2, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { getGroupAthletes, regenerateInviteToken, removeAthlete } from "../actions"
import type { Group, GroupAthlete } from "@/lib/types/group"

interface AthletesTabProps {
  group: Group
  onRefresh: () => void
}

export function AthletesTab({ group, onRefresh }: AthletesTabProps) {
  const t = useTranslations("athletes")
  const tc = useTranslations("common")
  const [athletes, setAthletes] = useState<GroupAthlete[]>([])
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [inviteLink, setInviteLink] = useState("")

  // Read window.location.origin after mount to avoid hydration mismatch.
  useEffect(() => {
    setInviteLink(`${window.location.origin}/invite/${group.inviteToken}`)
  }, [group.inviteToken])

  useEffect(() => {
    async function load() {
      const result = await getGroupAthletes(group.id)
      if (result.data) setAthletes(result.data)
      setLoading(false)
    }
    load()
  }, [group.id])

  const copyInviteLink = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    toast.success(t("linkCopied"))
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    const result = await regenerateInviteToken(group.id)
    setRegenerating(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(t("linkRegenerated"))
      onRefresh()
    }
  }

  const handleRemoveAthlete = async (athleteId: string) => {
    const result = await removeAthlete(group.id, athleteId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(t("athleteRemoved"))
      setAthletes((prev) => prev.filter((a) => a.id !== athleteId))
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("inviteLink")}</Label>
        <div className="flex gap-2">
          <Input value={inviteLink} readOnly className="min-w-0 text-xs font-mono" />
          <Button
            variant="outline"
            size="sm"
            onClick={copyInviteLink}
            aria-label={t("copyLink")}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating}
            aria-label={t("regenerateLink")}
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("linkExpiresOn", {
            date: new Date(group.inviteTokenExpiresAt).toLocaleDateString(),
          })}
        </p>
      </div>

      <Separator />

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : athletes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {t("noAthletes")}
        </p>
      ) : (
        <div className="space-y-2">
          {athletes.map((athlete) => (
            <div
              key={athlete.id}
              className="flex items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {athlete.firstName} {athlete.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{athlete.email}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {athlete.hasProfile ? (
                    <Badge className="bg-green-600 text-white text-xs">{t("profileComplete")}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">{t("profilePending")}</Badge>
                  )}
                  {athlete.gdprConsent && (
                    <Badge variant="secondary" className="text-xs">{t("gdprBadge")}</Badge>
                  )}
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t("removeAthlete")}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("removeAthleteTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("removeAthleteDescription")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleRemoveAthlete(athlete.id)}
                    >
                      {t("removeAthlete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
