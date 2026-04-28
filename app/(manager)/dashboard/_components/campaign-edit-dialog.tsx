"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
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
  const t = useTranslations("campaigns")
  const tc = useTranslations("common")
  const [saving, setSaving] = useState(false)
  // Synchronous lock against double-submit while React propagates disabled.
  const savingRef = useRef(false)
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
    if (savingRef.current) return
    if (!trainingLocation) {
      toast.error(t("selectLocationError"))
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      formData.set("timeRangeStart", timeRangeStart)
      formData.set("timeRangeEnd", timeRangeEnd)
      formData.set("trainingLocationFormatted", trainingLocation.formatted)
      formData.set("trainingLocationLat", String(trainingLocation.lat))
      formData.set("trainingLocationLng", String(trainingLocation.lng))
      formData.set("availableSlots", JSON.stringify(availableSlots))
      const result = await updateCampaign(groupId, campaign.id, formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("campaignUpdated"))
        onOpenChange(false)
        onSaved()
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Mobile: full-height takeover; desktop: centered modal capped at 90vh.
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:gap-4 sm:rounded-lg sm:p-6"
        onPointerDownOutside={(e) => {
          const target = e.target as Element | null
          if (target?.closest(".pac-container")) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          const target = e.target as Element | null
          if (target?.closest(".pac-container")) e.preventDefault()
        }}
      >
        <DialogHeader className="border-b p-4 sm:border-b-0 sm:p-0">
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-0 sm:py-4 sm:pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-startDate">{t("startDate")}</Label>
                <Input
                  id="edit-startDate"
                  name="startDate"
                  type="date"
                  defaultValue={campaign.startDate}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-endDate">{t("endDate")}</Label>
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
              <Label htmlFor="edit-deadline">{t("deadline")}</Label>
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
                <Label>{t("timeRangeStart")}</Label>
                <Select value={timeRangeStart} onValueChange={setTimeRangeStart}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {startTimeOptions.map((time) => (
                      <SelectItem key={time} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("timeRangeEnd")}</Label>
                <Select value={timeRangeEnd} onValueChange={setTimeRangeEnd}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {endTimeOptions.map((time) => (
                      <SelectItem key={time} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <AddressAutocompleteMap
              label={t("trainingLocation")}
              value={trainingLocation}
              onChange={setTrainingLocation}
              required
            />
            <div className="space-y-2">
              <Label>{t("availableSlots")}</Label>
              <p className="text-xs text-muted-foreground">{t("availableSlotsHint")}</p>
              <ConstraintsTapGrid
                value={availableSlots}
                onChange={setAvailableSlots}
              />
            </div>
          </div>
          <DialogFooter className="border-t p-4 sm:border-t-0 sm:p-0">
            <Button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
