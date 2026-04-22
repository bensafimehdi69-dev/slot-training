"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
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
    toast.success("Lien d'invitation copié.")
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    const result = await regenerateInviteToken(group.id)
    setRegenerating(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Nouveau lien d'invitation généré.")
      onRefresh()
    }
  }

  const handleRemoveAthlete = async (athleteId: string, name: string) => {
    const result = await removeAthlete(group.id, athleteId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${name} retiré du groupe.`)
      setAthletes((prev) => prev.filter((a) => a.id !== athleteId))
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Lien d&apos;invitation</Label>
        <div className="flex gap-2">
          <Input value={inviteLink} readOnly className="min-w-0 text-xs font-mono" />
          <Button
            variant="outline"
            size="sm"
            onClick={copyInviteLink}
            aria-label="Copier le lien d'invitation"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating}
            aria-label="Régénérer le lien d'invitation"
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Expire le {new Date(group.inviteTokenExpiresAt).toLocaleDateString("fr-FR")}
        </p>
      </div>

      <Separator />

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : athletes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Aucun athlète dans ce groupe. Partagez le lien d&apos;invitation.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">{athletes.length} athlète(s)</p>
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
                    <Badge className="bg-green-600 text-white text-xs">Profil complet</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">En attente</Badge>
                  )}
                  {athlete.gdprConsent && (
                    <Badge variant="secondary" className="text-xs">RGPD</Badge>
                  )}
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Retirer ${athlete.firstName} ${athlete.lastName} du groupe`}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Retirer {athlete.firstName} {athlete.lastName} ?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      L&apos;athlète sera retiré du groupe. Ses réponses aux campagnes
                      existantes resteront enregistrées.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        handleRemoveAthlete(
                          athlete.id,
                          `${athlete.firstName} ${athlete.lastName}`
                        )
                      }
                    >
                      Retirer
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
