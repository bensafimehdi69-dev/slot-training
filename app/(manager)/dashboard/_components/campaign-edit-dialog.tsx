"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
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
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AddressAutocompleteMap } from "@/components/custom/address-autocomplete-map"
import { ConstraintsTapGrid } from "@/components/custom/constraints-tap-grid"
import { updateCampaign } from "../actions"
import type { Campaign } from "@/lib/types/campaign"
import type { AddressWithCoords } from "@/lib/types/address"

interface CampaignEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  campaign: Campaign
  onSaved: () => void
}

export function CampaignEditDialog({
  open,
  onOpenChange,
  groupId,
  campaign,
  onSaved,
}: CampaignEditDialogProps) {
  const [saving, setSaving] = useState(false)
  const [timeRangeStart, setTimeRangeStart] = useState(campaign.timeRangeStart || "08:00")
  const [timeRangeEnd, setTimeRangeEnd] = useState(campaign.timeRangeEnd || "20:00")
  const [trainingLocation, setTrainingLocation] = useState<AddressWithCoords | null>(
    campaign.trainingLocation
      ? {
          formatted: campaign.trainingLocation.formatted,
          lat: campaign.trainingLocation.lat,
          lng: campaign.trainingLocation.lng,
        }
      : null
  )
  const [availableSlots, setAvailableSlots] = useState<boolean[][]>(
    campaign.availableSlots ??
      Array(7).fill(null).map(() => Array<boolean>(16).fill(true))
  )

  const startTimeOptions = Array.from({ length: 7 }, (_, i) => {
    const h = 6 + i
    return `${h.toString().padStart(2, "0")}:00`
  })
  const endTimeOptions = Array.from({ length: 7 }, (_, i) => {
    const h = 16 + i
    return `${h.toString().padStart(2, "0")}:00`
  })

  const deadlineDefault =
    campaign.deadline instanceof Date
      ? campaign.deadline.toISOString().slice(0, 10)
      : new Date(campaign.deadline as unknown as string).toISOString().slice(0, 10)

  async function handleSubmit(formData: FormData) {
    if (!trainingLocation) {
      toast.error("Sélectionnez un lieu d'entraînement sur la carte.")
      return
    }
    setSaving(true)
    formData.set("timeRangeStart", timeRangeStart)
    formData.set("timeRangeEnd", timeRangeEnd)
    formData.set("trainingLocationFormatted", trainingLocation.formatted)
    formData.set("trainingLocationLat", String(trainingLocation.lat))
    formData.set("trainingLocationLng", String(trainingLocation.lng))
    formData.set("availableSlots", JSON.stringify(availableSlots))
    const result = await updateCampaign(groupId, campaign.id, formData)
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Campagne mise à jour. Les athlètes ont été notifiés.")
      onOpenChange(false)
      onSaved()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] max-w-md flex-col overflow-hidden"
        onPointerDownOutside={(e) => {
          const target = e.target as Element | null
          if (target?.closest(".pac-container")) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          const target = e.target as Element | null
          if (target?.closest(".pac-container")) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>Modifier la campagne</DialogTitle>
          <DialogDescription>
            Toute modification réinitialise l&apos;optimisation et envoie un email
            de mise à jour aux athlètes du groupe.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto py-4 pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-startDate">Date de début</Label>
                <Input
                  id="edit-startDate"
                  name="startDate"
                  type="date"
                  defaultValue={campaign.startDate}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-endDate">Date de fin</Label>
                <Input
                  id="edit-endDate"
                  name="endDate"
                  type="date"
                  defaultValue={campaign.endDate}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-deadline">Date limite de réponse</Label>
              <Input
                id="edit-deadline"
                name="deadline"
                type="date"
                defaultValue={deadlineDefault}
                required
              />
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
              <Label>Créneaux disponibles entraîneur + salle</Label>
              <p className="text-xs text-muted-foreground">
                Touchez les créneaux indisponibles. Seules les cases vertes
                seront proposées comme séances.
              </p>
              <ConstraintsTapGrid
                value={availableSlots}
                onChange={setAvailableSlots}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
