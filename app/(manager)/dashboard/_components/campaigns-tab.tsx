"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AddressAutocompleteMap } from "@/components/custom/address-autocomplete-map"
import { getCampaigns, createCampaign } from "../actions"
import { CampaignCard } from "./campaign-card"
import type { Group } from "@/lib/types/group"
import type { Campaign } from "@/lib/types/campaign"
import type { AddressWithCoords } from "@/lib/types/address"

interface CampaignsTabProps {
  group: Group
  onRefresh: () => void
}

export function CampaignsTab({ group, onRefresh: _onRefresh }: CampaignsTabProps) {
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
                Définissez la période et les paramètres de la campagne.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreateCampaign}>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Date de début</Label>
                    <Input id="startDate" name="startDate" type="date" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">Date de fin</Label>
                    <Input id="endDate" name="endDate" type="date" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Heure début plage</Label>
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
