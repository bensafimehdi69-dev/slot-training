"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { ConstraintsTapGrid } from "@/components/custom/constraints-tap-grid"
import { getCampaigns, createCampaign, getGroupAthletes } from "../actions"
import { CampaignCard } from "./campaign-card"
import type { Group, GroupAthlete } from "@/lib/types/group"
import type { ManagerCampaign } from "@/lib/types/campaign"
import type { AddressWithCoords } from "@/lib/types/address"

// Coach + facility availability is a plain boolean grid — no school/home
// distinction. The athlete-side ConstraintsGrid moved to a three-state shape
// in Lot 4, but the coach side stays boolean.
type AvailableSlots = boolean[][]
function createDefaultAvailableSlots(): AvailableSlots {
  return Array(7)
    .fill(null)
    .map(() => Array<boolean>(16).fill(true))
}

interface CampaignsTabProps {
  group: Group
}

export function CampaignsTab({ group }: CampaignsTabProps) {
  const t = useTranslations("campaigns")
  const [campaigns, setCampaigns] = useState<ManagerCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  // Synchronous lock against double-submit. The `creating` state propagates
  // to the disabled prop one render late — fast double-clicks (and Enter
  // mashing) can fire two submits before the DOM reflects the disabled state.
  // The ref flips synchronously, so the second handler call exits immediately.
  const creatingRef = useRef(false)
  const [timeRangeStart, setTimeRangeStart] = useState("08:00")
  const [timeRangeEnd, setTimeRangeEnd] = useState("20:00")
  const [trainingLocation, setTrainingLocation] = useState<AddressWithCoords | null>(null)
  const [availableSlots, setAvailableSlots] = useState<AvailableSlots>(
    createDefaultAvailableSlots()
  )
  const [athletes, setAthletes] = useState<GroupAthlete[]>([])
  const [athletesLoading, setAthletesLoading] = useState(false)
  // Athletes who will receive this campaign. Default = every athlete in the
  // group. The Set keeps toggle / select-all logic O(1) and avoids order
  // sensitivity when comparing against the loaded athletes list.
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<Set<string>>(new Set())

  const loadCampaigns = useCallback(async () => {
    const result = await getCampaigns(group.id)
    if (result.data) setCampaigns(result.data)
    setLoading(false)
  }, [group.id])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  // Live updates: refetch when the manager comes back to the tab/window and
  // poll every 30 s while the campaigns view is mounted, so athlete responses
  // appear without a manual refresh. Polling is paused while the document is
  // hidden so we don't burn round-trips when the app is in the background.
  useEffect(() => {
    if (typeof window === "undefined") return
    const refresh = () => {
      if (document.visibilityState === "visible") loadCampaigns()
    }
    document.addEventListener("visibilitychange", refresh)
    window.addEventListener("focus", refresh)
    const interval = window.setInterval(refresh, 30_000)
    return () => {
      document.removeEventListener("visibilitychange", refresh)
      window.removeEventListener("focus", refresh)
      window.clearInterval(interval)
    }
  }, [loadCampaigns])

  // Load athletes when the create dialog opens — keeps the initial render
  // cheap when the manager isn't planning to create a campaign right now.
  useEffect(() => {
    if (!createOpen) return
    let cancelled = false
    setAthletesLoading(true)
    getGroupAthletes(group.id).then((result) => {
      if (cancelled) return
      const list = result.data ?? []
      setAthletes(list)
      setSelectedAthleteIds(new Set(list.map((a) => a.id)))
      setAthletesLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [createOpen, group.id])

  const allSelected = useMemo(
    () => athletes.length > 0 && selectedAthleteIds.size === athletes.length,
    [athletes.length, selectedAthleteIds.size]
  )

  const toggleAthlete = (athleteId: string) => {
    setSelectedAthleteIds((prev) => {
      const next = new Set(prev)
      if (next.has(athleteId)) next.delete(athleteId)
      else next.add(athleteId)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedAthleteIds((prev) =>
      prev.size === athletes.length ? new Set() : new Set(athletes.map((a) => a.id))
    )
  }

  const handleCreateCampaign = async (formData: FormData) => {
    if (creatingRef.current) return
    if (!trainingLocation) {
      toast.error(t("selectLocationError"))
      return
    }
    if (athletes.length > 0 && selectedAthleteIds.size === 0) {
      toast.error(t("selectAtLeastOneAthlete"))
      return
    }
    creatingRef.current = true
    setCreating(true)
    try {
      formData.set("timeRangeStart", timeRangeStart)
      formData.set("timeRangeEnd", timeRangeEnd)
      formData.set("trainingLocationFormatted", trainingLocation.formatted)
      formData.set("trainingLocationLat", String(trainingLocation.lat))
      formData.set("trainingLocationLng", String(trainingLocation.lng))
      formData.set("availableSlots", JSON.stringify(availableSlots))
      formData.set(
        "targetAthleteIds",
        JSON.stringify(Array.from(selectedAthleteIds))
      )
      const result = await createCampaign(group.id, formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("campaignCreated"))
        setCreateOpen(false)
        setTrainingLocation(null)
        setAvailableSlots(createDefaultAvailableSlots())
        loadCampaigns()
      }
    } finally {
      creatingRef.current = false
      setCreating(false)
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
          {t("tabTitle", { count: campaigns.length })}
        </p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t("newCampaign")}
            </Button>
          </DialogTrigger>
          <DialogContent
            // Mobile: full-height takeover so the dense form (dates + grid +
            // athlete multi-select) gets the entire viewport. Desktop: keep
            // the centered modal capped at 90vh so the page behind stays
            // visible.
            className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:gap-4 sm:rounded-lg sm:p-6"
            // Google Places Autocomplete appends its dropdown (.pac-container) to
            // <body>, i.e. outside this modal's DOM subtree. Radix treats those
            // clicks as "pointer-down outside" and closes the dialog before the
            // `place_changed` handler can fire — so clicking a suggestion just
            // dismisses the form without populating the address. Preventing the
            // default close for pac-container clicks keeps the dialog open and
            // lets Google handle the selection normally.
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
              <DialogTitle>{t("createTitle")}</DialogTitle>
              <DialogDescription>{t("createDescription")}</DialogDescription>
            </DialogHeader>
            <form action={handleCreateCampaign} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-0 sm:py-4 sm:pr-1">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">{t("startDate")}</Label>
                    <Input id="startDate" name="startDate" type="date" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">{t("endDate")}</Label>
                    <Input id="endDate" name="endDate" type="date" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadline">{t("deadline")}</Label>
                  <Input id="deadline" name="deadline" type="date" required />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>{t("targetAthletes")}</Label>
                    {athletes.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {allSelected ? t("deselectAll") : t("selectAll")}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("targetAthletesHint")}</p>
                  {athletesLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : athletes.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                      {t("noAthletesInGroup")}
                    </p>
                  ) : (
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                      {athletes.map((athlete) => {
                        const checked = selectedAthleteIds.has(athlete.id)
                        const fullName = `${athlete.firstName ?? ""} ${athlete.lastName ?? ""}`.trim() || athlete.email
                        return (
                          <label
                            key={athlete.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleAthlete(athlete.id)}
                            />
                            <span className="flex-1 truncate text-sm">{fullName}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter className="border-t p-4 sm:border-t-0 sm:p-0">
                <Button
                  type="submit"
                  disabled={creating}
                  className="w-full sm:w-auto"
                >
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t("createCampaign")}
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
          {t("noCampaigns")}
        </p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              groupId={group.id}
              campaign={campaign}
              responders={campaign.responders}
              onRefresh={loadCampaigns}
              onLocalRemove={(id) =>
                setCampaigns((prev) => prev.filter((c) => c.id !== id))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
