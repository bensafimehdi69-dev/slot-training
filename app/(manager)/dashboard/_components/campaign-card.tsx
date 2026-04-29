"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import {
  CalendarDays,
  MapPin,
  Lock,
  Play,
  Loader2,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Check,
  Clock,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { OptimizationResultView } from "@/components/custom/optimization-result-view"
import { CampaignEditDialog } from "./campaign-edit-dialog"
import {
  closeCampaign,
  runOptimization,
  validatePlanning,
  rejectPlanning,
  deleteCampaign,
} from "../actions"
import type { Campaign, CampaignResponder } from "@/lib/types/campaign"
import type { GroupRole } from "@/lib/types/group"

interface CampaignCardProps {
  groupId: string
  campaign: Campaign
  // Pre-fetched by getCampaigns so we don't re-issue a per-card request from
  // useEffect. Always provided in the dashboard flow; the parameter is kept
  // optional only as a defensive default for future callers.
  responders?: CampaignResponder[]
  // Role of the current viewer relative to the parent group. "viewer"
  // collapses the card to read-only: response count + result view, but no
  // finalize / optimize / validate / reject / edit / delete buttons.
  role?: GroupRole
  onRefresh: () => void
  // Optimistic removal — the parent drops the campaign from its list
  // immediately so the card disappears the instant the manager confirms,
  // without waiting on the server round-trip + refetch.
  onLocalRemove?: (campaignId: string) => void
}

export function CampaignCard({
  groupId,
  campaign,
  responders = [],
  role = "owner",
  onRefresh,
  onLocalRemove,
}: CampaignCardProps) {
  const isViewer = role === "viewer"
  const t = useTranslations("campaigns")
  const tp = useTranslations("planning")
  const tc = useTranslations("common")
  const [respondersOpen, setRespondersOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Controlled state so we can trigger the delete confirm from a dropdown
  // item (the AlertDialog can't have its own trigger when launched from a
  // menu item — Radix dismisses the menu before the dialog opens otherwise).
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const respondedCount = responders.filter((r) => r.hasResponded).length
  const targetCount = responders.length
  // True only while the campaign still accepts the click — once it's been
  // finalized (status = "closed") the prominent variant is no longer useful.
  const allResponded =
    targetCount > 0 && respondedCount === targetCount && campaign.status === "active"

  const handleClose = async () => {
    setClosing(true)
    const result = await closeCampaign(groupId, campaign.id)
    setClosing(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(t("campaignFinalized"))
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
      toast.success(t("optimizationDone"))
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
      toast.success(tp("validated"))
      onRefresh()
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    // Drop the card from the list immediately; if the server rejects the
    // delete we surface the error and trigger a refresh that resurrects
    // the card with its real state.
    onLocalRemove?.(campaign.id)
    const result = await deleteCampaign(groupId, campaign.id)
    setDeleting(false)
    if (result.error) {
      toast.error(result.error)
      onRefresh()
    } else {
      toast.success(t("campaignDeleted"))
    }
  }

  const handleReject = async () => {
    setRejecting(true)
    const result = await rejectPlanning(groupId, campaign.id)
    setRejecting(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(tp("rejected"))
      onRefresh()
    }
  }

  const statusBadge = () => {
    if (campaign.planningStatus === "validated") {
      return <Badge className="bg-green-600 text-white">{t("statusValidated")}</Badge>
    }
    if (campaign.planningStatus === "rejected") {
      return <Badge variant="destructive">{t("statusRejected")}</Badge>
    }
    if (campaign.status === "closed") {
      return <Badge variant="secondary">{t("statusClosed")}</Badge>
    }
    return <Badge>{t("statusActive")}</Badge>
  }

  // Two-line preview only — keeps the dashboard scannable. Tap anywhere on
  // the row (except the side icon stack) to expand the full details:
  // time range, deadline, responders, action buttons, and the validated
  // planning when present.
  const [detailsOpen, setDetailsOpen] = useState(false)
  // Auto-expand when the manager opens a campaign result, so the planning
  // view doesn't render inside a collapsed shell.
  const expanded = detailsOpen || showResult

  return (
    <Card>
      {/* Reduced horizontal padding on mobile so the optimisation result
          (which is rendered inside this content) gets more usable width.
          Three nested px-6 paddings (group → campaign → planning) used to
          eat ~150px on a phone, leaving very little room for the slot
          cards themselves. */}
      <CardContent className="px-3 pt-4 sm:px-6">
        <div className="flex flex-col gap-3">
          {/* Compact 2-line preview. The text column is the click target;
              the right rail (edit + delete, stacked) keeps secondary
              actions reachable in one tap without expanding the card. */}
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? t("hideDetails") : t("viewDetails")}
              className="min-w-0 flex-1 rounded-md text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">
                  {t("rangeFromTo", { start: campaign.startDate, end: campaign.endDate })}
                </span>
                {statusBadge()}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm text-muted-foreground">
                  {campaign.trainingLocation.formatted}
                </span>
              </div>
            </button>

            {!isViewer && (
              <div className="flex shrink-0 flex-col items-center justify-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditOpen(true)
                  }}
                  aria-label={tc("edit")}
                  disabled={deleting}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteConfirmOpen(true)
                  }}
                  aria-label={tc("delete")}
                  disabled={deleting}
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Full-width "all responded" banner stays visible while collapsed
              so the manager doesn't miss the cue to finalise. */}
          {allResponded && !expanded && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-800">
              {t("allRespondedBanner")}
            </div>
          )}

          {expanded && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {t("timeRange", { start: campaign.timeRangeStart, end: campaign.timeRangeEnd })}
                </span>
                <span>
                  {t("deadlineShort", {
                    date: new Date(campaign.deadline).toLocaleDateString(),
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => setRespondersOpen((v) => !v)}
                  disabled={targetCount === 0}
                  className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline disabled:cursor-default disabled:no-underline disabled:opacity-70"
                >
                  {respondersOpen ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {targetCount > 1
                    ? t("responseCountPlural", { responded: respondedCount, target: targetCount })
                    : t("responseCount", { responded: respondedCount, target: targetCount })}
                </button>
              </div>
              {campaign.status === "active" && respondedCount > 0 && !allResponded && (
                <p className="text-xs italic text-muted-foreground">
                  {t("finalizeToOptimize")}
                </p>
              )}
              {allResponded && (
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-800">
                  {t("allRespondedBanner")}
                </div>
              )}
              {respondersOpen && responders.length > 0 && (
                <ul className="space-y-1 rounded-md border bg-muted/30 p-2">
                  {responders.map((r) => {
                    const fullName =
                      `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.athleteId
                    return (
                      <li
                        key={r.athleteId}
                        className="flex items-center gap-2 text-xs"
                      >
                        {r.hasResponded ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className={r.hasResponded ? "" : "text-muted-foreground"}>
                          {fullName}
                        </span>
                        {!r.hasResponded && (
                          <span className="text-muted-foreground">— {t("responderPending")}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {campaign.optimizationResult && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResult(!showResult)}
                  >
                    {showResult ? t("hideResult") : t("viewResult")}
                  </Button>
                )}
                {!isViewer && campaign.status === "active" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        // Filled green pops once everyone has responded so the
                        // manager's next action is obvious; outline keeps the
                        // dashboard quiet while replies are still trickling in.
                        variant={allResponded ? "default" : "outline"}
                        size="sm"
                        disabled={closing}
                        aria-label={t("finalize")}
                        className={
                          allResponded
                            ? "bg-green-600 text-white shadow-sm hover:bg-green-700"
                            : undefined
                        }
                      >
                        {closing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                        <span className="ml-1">{t("finalize")}</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("finalizeTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("finalizeDescription")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleClose}>{t("finalize")}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {!isViewer && campaign.status === "closed" && !campaign.optimizationResult && (
                  <Button
                    size="sm"
                    onClick={handleOptimize}
                    disabled={optimizing}
                    aria-label={t("optimize")}
                  >
                    {optimizing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    <span className="ml-1">{t("optimize")}</span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {!isViewer && (
            <AlertDialog
              open={deleteConfirmOpen}
              onOpenChange={setDeleteConfirmOpen}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    {tc("delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <CampaignEditDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            groupId={groupId}
            campaign={campaign}
            onSaved={onRefresh}
          />

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
                role={role}
              />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
