"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  CalendarDays,
  MapPin,
  Lock,
  Play,
  Loader2,
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
import {
  closeCampaign,
  runOptimization,
  validatePlanning,
  rejectPlanning,
  getResponseCount,
} from "../actions"
import type { Campaign } from "@/lib/types/campaign"

interface CampaignCardProps {
  groupId: string
  campaign: Campaign
  onRefresh: () => void
}

export function CampaignCard({ groupId, campaign, onRefresh }: CampaignCardProps) {
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
      return <Badge className="bg-green-600 text-white">Validé</Badge>
    }
    if (campaign.planningStatus === "rejected") {
      return <Badge variant="destructive">Rejeté</Badge>
    }
    if (campaign.status === "closed") {
      return <Badge variant="secondary">Fermée</Badge>
    }
    return <Badge>Active</Badge>
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-col gap-3">
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

            <div className="flex gap-2">
              {campaign.status === "active" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={closing}
                      aria-label="Fermer la campagne"
                    >
                      {closing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                      <span className="ml-1 hidden sm:inline">Fermer</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Fermer cette campagne ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Les athlètes ne pourront plus répondre. Vous pourrez
                        ensuite lancer l&apos;optimisation.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClose}>Fermer</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {campaign.status === "closed" && !campaign.optimizationResult && (
                <Button
                  size="sm"
                  onClick={handleOptimize}
                  disabled={optimizing}
                  aria-label="Lancer l'optimisation"
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
                  {showResult ? "Masquer" : "Voir le résultat"}
                </Button>
              )}
            </div>
          </div>

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
