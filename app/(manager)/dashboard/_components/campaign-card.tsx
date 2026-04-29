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
  ChevronUp,
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
  const tcs = useTranslations("campaignCardSimple")
  // The card now defaults to a compact preview (date range + status + location
  // on two lines). Anything more detailed — deadline, response count,
  // finalize/optimize buttons, optimisation result — only appears once the
  // manager expands the card by clicking the header. Keeps the dashboard
  // scannable when many campaigns are listed.
  const [expanded, setExpanded] = useState(false)
  const [respondersOpen, setRespondersOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Controlled state so we can trigger the delete confirm from a separate
  // button without it bubbling into the header toggle handler.
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
      return (
        <Badge className="bg-green-600 px-1.5 py-0 text-[10px] leading-4 text-white">
          {t("statusValidated")}
        </Badge>
      )
    }
    if (campaign.planningStatus === "rejected") {
      return (
        <Badge variant="destructive" className="px-1.5 py-0 text-[10px] leading-4">
          {t("statusRejected")}
        </Badge>
      )
    }
    if (campaign.status === "closed") {
      return (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] leading-4">
          {t("statusClosed")}
        </Badge>
      )
    }
    return (
      <Badge className="px-1.5 py-0 text-[10px] leading-4">
        {t("statusActive")}
      </Badge>
    )
  }

  const panelId = `campaign-panel-${campaign.id}`

  return (
    <Card>
      {/* Reduced horizontal padding on mobile so the optimisation result
          (which is rendered inside this content) gets more usable width. */}
      <CardContent className="px-3 py-3 sm:px-6">
        {/* Compact preview row: two lines of identifying info on the left
            (date range + status, training location) with edit / delete
            icons stacked on the right. The whole row is clickable to
            expand the card; the icons stop propagation so they don't
            toggle the panel. */}
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={expanded ? tcs("collapse") : tcs("expand")}
            className="flex min-w-0 flex-1 flex-col gap-1 text-left"
          >
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium">
                {t("rangeFromTo", {
                  start: campaign.startDate,
                  end: campaign.endDate,
                })}
              </span>
              {statusBadge()}
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-xs text-muted-foreground">
                {campaign.trainingLocation.formatted}
              </span>
            </div>
          </button>

          {!isViewer ? (
            <div className="flex shrink-0 flex-col items-center justify-between gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={tc("edit")}
                onClick={(e) => {
                  e.stopPropagation()
                  setEditOpen(true)
                }}
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={tc("delete")}
                disabled={deleting}
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteConfirmOpen(true)
                }}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center">
              {expanded ? (
                <ChevronUp
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <ChevronDown
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </div>
          )}
        </div>

        {expanded && (
          <div id={panelId} className="mt-3 flex flex-col gap-3">
            <Separator />

            {/* Secondary metadata that used to clutter the preview. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t("timeRange", {
                  start: campaign.timeRangeStart,
                  end: campaign.timeRangeEnd,
                })}
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
                  <ChevronDown className="h-3 w-3 -rotate-90" />
                )}
                {targetCount > 1
                  ? t("responseCountPlural", {
                      responded: respondedCount,
                      target: targetCount,
                    })
                  : t("responseCount", {
                      responded: respondedCount,
                      target: targetCount,
                    })}
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
                    `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() ||
                    r.athleteId
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
                      <span
                        className={r.hasResponded ? "" : "text-muted-foreground"}
                      >
                        {fullName}
                      </span>
                      {!r.hasResponded && (
                        <span className="text-muted-foreground">
                          — {t("responderPending")}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Primary actions */}
            <div className="flex flex-wrap gap-2">
              {!isViewer && campaign.status === "active" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
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
                      <AlertDialogAction onClick={handleClose}>
                        {t("finalize")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {!isViewer &&
                campaign.status === "closed" &&
                !campaign.optimizationResult && (
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

            {/* Once an optimisation exists, render the per-day planning
                inline — the previous "View result / Hide" toggle just
                added an extra click between the manager and the data. */}
            {campaign.optimizationResult && (
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
                  campaignId={campaign.id}
                />
              </>
            )}
          </div>
        )}

        {!isViewer && (
          <CampaignEditDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            groupId={groupId}
            campaign={campaign}
            onSaved={onRefresh}
          />
        )}

        {!isViewer && (
          <AlertDialog
            open={deleteConfirmOpen}
            onOpenChange={setDeleteConfirmOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteDescription")}
                </AlertDialogDescription>
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
      </CardContent>
    </Card>
  )
}
