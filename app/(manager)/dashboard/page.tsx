"use client"

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import {
  Plus,
  Copy,
  RefreshCw,
  Users,
  CalendarDays,
  MapPin,
  Trash2,
  Pencil,
  Lock,
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { OptimizationResultView } from "@/components/custom/optimization-result-view"
import { AddressAutocompleteMap } from "@/components/custom/address-autocomplete-map"
import type { AddressWithCoords } from "@/lib/types/address"

import {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  regenerateInviteToken,
  getGroupAthletes,
  removeAthlete,
  getCampaigns,
  createCampaign,
  closeCampaign,
  runOptimization,
  validatePlanning,
  rejectPlanning,
  getResponseCount,
} from "./actions"

import type { Group, GroupAthlete } from "@/lib/types/group"
import type { Campaign } from "@/lib/types/campaign"

// ============ MAIN DASHBOARD PAGE ============

export default function DashboardPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const loadGroups = useCallback(async () => {
    const result = await getGroups()
    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setGroups(result.data)
      // Auto-expand first group
      if (result.data.length > 0 && expandedGroups.size === 0) {
        setExpandedGroups(new Set([result.data[0].id]))
      }
    }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  const handleCreateGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (creatingGroup) return
    setCreatingGroup(true)
    const formData = new FormData(e.currentTarget)
    const result = await createGroup(formData)
    setCreatingGroup(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Groupe créé avec succès.")
      setCreateGroupOpen(false)
      loadGroups()
    }
  }

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Gerez vos groupes, campagnes et plannings.</p>
        </div>
        <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau groupe
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer un groupe</DialogTitle>
              <DialogDescription>
                Créez un groupe pour y inviter vos athlètes.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateGroup}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du groupe</Label>
                  <Input id="name" name="name" placeholder="Ex: U18 Garcons" required />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creatingGroup}>
                  {creatingGroup && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Créer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Groups List */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Aucun groupe pour le moment. Créez votre premier groupe pour commencer.
            </p>
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

// ============ GROUP CARD ============

function GroupCard({
  group,
  isExpanded,
  onToggle,
  onRefresh,
}: {
  group: Group
  isExpanded: boolean
  onToggle: () => void
  onRefresh: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (editing) return
    setEditing(true)
    const formData = new FormData(e.currentTarget)
    const result = await updateGroup(group.id, formData)
    setEditing(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Groupe modifié.")
      setEditOpen(false)
      onRefresh()
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Supprimer le groupe "${group.name}" ? Cette action est irréversible et supprimera tous les athlètes et campagnes associés.`)) return
    setDeleting(true)
    const result = await deleteGroup(group.id)
    setDeleting(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Groupe supprimé.")
      onRefresh()
    }
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle className="text-lg">{group.name}</CardTitle>
              <CardDescription>
                Créé le {new Date(group.createdAt).toLocaleDateString("fr-FR")}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DialogTrigger>
              <DialogContent onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                  <DialogTitle>Modifier le groupe</DialogTitle>
                  <DialogDescription>
                    Modifiez le nom du groupe.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleEdit}>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor={`edit-name-${group.id}`}>Nom du groupe</Label>
                      <Input
                        id={`edit-name-${group.id}`}
                        name="name"
                        defaultValue={group.name}
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={editing}>
                      {editing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Enregistrer
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete()
              }}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin text-red-500" />
              ) : (
                <Trash2 className="h-4 w-4 text-red-500" />
              )}
            </Button>
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent>
          <Tabs defaultValue="athletes" className="w-full">
            <TabsList>
              <TabsTrigger value="athletes">Athlètes</TabsTrigger>
              <TabsTrigger value="campaigns">Campagnes</TabsTrigger>
            </TabsList>

            <TabsContent value="athletes" className="mt-4">
              <AthletesTab group={group} onRefresh={onRefresh} />
            </TabsContent>

            <TabsContent value="campaigns" className="mt-4">
              <CampaignsTab group={group} onRefresh={onRefresh} />
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  )
}

// ============ ATHLETES TAB ============

function AthletesTab({ group, onRefresh }: { group: Group; onRefresh: () => void }) {
  const [athletes, setAthletes] = useState<GroupAthlete[]>([])
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)

  const appUrl = typeof window !== "undefined" ? window.location.origin : ""
  const inviteLink = `${appUrl}/invite/${group.inviteToken}`

  useEffect(() => {
    async function load() {
      const result = await getGroupAthletes(group.id)
      if (result.data) setAthletes(result.data)
      setLoading(false)
    }
    load()
  }, [group.id])

  const copyInviteLink = () => {
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
    if (!confirm(`Retirer ${name} du groupe ?`)) return
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
      {/* Invite Link */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Lien d&apos;invitation</Label>
        <div className="flex gap-2">
          <Input value={inviteLink} readOnly className="min-w-0 text-xs font-mono" />
          <Button variant="outline" size="sm" onClick={copyInviteLink}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating}
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

      {/* Athletes List */}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  handleRemoveAthlete(athlete.id, `${athlete.firstName} ${athlete.lastName}`)
                }
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ CAMPAIGNS TAB ============

function CampaignsTab({ group, onRefresh }: { group: Group; onRefresh: () => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [timeRangeStart, setTimeRangeStart] = useState("08:00")
  const [timeRangeEnd, setTimeRangeEnd] = useState("20:00")
  const [trainingLocation, setTrainingLocation] = useState<AddressWithCoords | null>(null)

  const loadCampaigns = useCallback(async () => {
    const result = await getCampaigns(group.id)
    if (result.data) setCampaigns(result.data)
    setLoading(false)
  }, [group.id])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  const handleCreateCampaign = async (formData: FormData) => {
    if (!trainingLocation) {
      toast.error("Sélectionnez un lieu d'entraînement sur la carte.")
      return
    }
    setCreating(true)
    formData.set("timeRangeStart", timeRangeStart)
    formData.set("timeRangeEnd", timeRangeEnd)
    formData.set("trainingLocationFormatted", trainingLocation.formatted)
    formData.set("trainingLocationLat", String(trainingLocation.lat))
    formData.set("trainingLocationLng", String(trainingLocation.lng))
    const result = await createCampaign(group.id, formData)
    setCreating(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Campagne créée. Les athlètes ont été notifiés par email.")
      setCreateOpen(false)
      setTrainingLocation(null)
      loadCampaigns()
    }
  }

  const startTimeOptions = Array.from({ length: 7 }, (_, i) => {
    const h = 6 + i
    return `${h.toString().padStart(2, "0")}:00`
  })

  const endTimeOptions = Array.from({ length: 7 }, (_, i) => {
    const h = 16 + i
    return `${h.toString().padStart(2, "0")}:00`
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {campaigns.length} campagne(s)
        </p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle campagne
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Créer une campagne</DialogTitle>
              <DialogDescription>
                Definissez la periode et les parametres de la campagne.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreateCampaign}>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Date de debut</Label>
                    <Input id="startDate" name="startDate" type="date" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">Date de fin</Label>
                    <Input id="endDate" name="endDate" type="date" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Heure debut plage</Label>
                    <Select value={timeRangeStart} onValueChange={setTimeRangeStart}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {startTimeOptions.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Heure fin plage</Label>
                    <Select value={timeRangeEnd} onValueChange={setTimeRangeEnd}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {endTimeOptions.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <AddressAutocompleteMap
                  label="Lieu d'entraînement"
                  value={trainingLocation}
                  onChange={setTrainingLocation}
                  required
                />
                <div className="space-y-2">
                  <Label htmlFor="deadline">Date limite de réponse</Label>
                  <Input id="deadline" name="deadline" type="date" required />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Créer la campagne
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Aucune campagne. Créez une campagne pour commencer à collecter les disponibilités.
        </p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              groupId={group.id}
              campaign={campaign}
              onRefresh={loadCampaigns}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============ CAMPAIGN CARD ============

function CampaignCard({
  groupId,
  campaign,
  onRefresh,
}: {
  groupId: string
  campaign: Campaign
  onRefresh: () => void
}) {
  const [responseCount, setResponseCount] = useState<number | null>(null)
  const [closing, setClosing] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [showResult, setShowResult] = useState(false)

  useEffect(() => {
    async function loadCount() {
      const result = await getResponseCount(groupId, campaign.id)
      if (result.data !== undefined) setResponseCount(result.data)
    }
    loadCount()
  }, [groupId, campaign.id])

  const handleClose = async () => {
    if (!confirm("Fermer cette campagne ? Les athlètes ne pourront plus répondre.")) return
    setClosing(true)
    const result = await closeCampaign(groupId, campaign.id)
    setClosing(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Campagne fermée.")
      onRefresh()
    }
  }

  const handleOptimize = async () => {
    setOptimizing(true)
    const result = await runOptimization(groupId, campaign.id)
    setOptimizing(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Optimisation terminée.")
      setShowResult(true)
      onRefresh()
    }
  }

  const handleValidate = async () => {
    setValidating(true)
    const result = await validatePlanning(groupId, campaign.id)
    setValidating(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Planning validé. Les athlètes ont été notifiés par email.")
      onRefresh()
    }
  }

  const handleReject = async () => {
    if (!confirm("Rejeter ce planning ? L'optimisation sera supprimée.")) return
    setRejecting(true)
    const result = await rejectPlanning(groupId, campaign.id)
    setRejecting(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Planning rejeté.")
      onRefresh()
    }
  }

  const statusBadge = () => {
    if (campaign.planningStatus === "validated") {
      return <Badge className="bg-green-600 text-white">Valide</Badge>
    }
    if (campaign.planningStatus === "rejected") {
      return <Badge variant="destructive">Rejeté</Badge>
    }
    if (campaign.status === "closed") {
      return <Badge variant="secondary">Fermee</Badge>
    }
    return <Badge>Active</Badge>
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-col gap-3">
          {/* Campaign Info Row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {campaign.startDate} au {campaign.endDate}
                </span>
                {statusBadge()}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {campaign.trainingLocation.formatted}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Plage : {campaign.timeRangeStart} - {campaign.timeRangeEnd}
                </span>
                <span>
                  Limite : {new Date(campaign.deadline).toLocaleDateString("fr-FR")}
                </span>
                {responseCount !== null && (
                  <span className="font-medium text-blue-600">
                    {responseCount} réponse(s)
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {campaign.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  disabled={closing}
                >
                  {closing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  <span className="ml-1 hidden sm:inline">Fermer</span>
                </Button>
              )}
              {campaign.status === "closed" && !campaign.optimizationResult && (
                <Button
                  size="sm"
                  onClick={handleOptimize}
                  disabled={optimizing}
                >
                  {optimizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span className="ml-1 hidden sm:inline">Optimiser</span>
                </Button>
              )}
              {campaign.optimizationResult && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowResult(!showResult)}
                >
                  {showResult ? "Masquer" : "Voir le resultat"}
                </Button>
              )}
            </div>
          </div>

          {/* Optimization Result */}
          {showResult && campaign.optimizationResult && (
            <>
              <Separator />
              <OptimizationResultView
                result={campaign.optimizationResult}
                planningStatus={campaign.planningStatus}
                onValidate={handleValidate}
                onReject={handleReject}
                isValidating={validating}
                isRejecting={rejecting}
              />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
