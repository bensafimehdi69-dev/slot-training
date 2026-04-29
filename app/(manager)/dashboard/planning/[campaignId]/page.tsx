import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getCampaignPlanning } from "./actions"
import { WeeklyPlanningView } from "@/components/custom/weekly-planning-view"

export default async function PlanningPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  const t = await getTranslations("weeklyPlanning")
  const result = await getCampaignPlanning(campaignId)

  if (result.error || !result.data) {
    // No "edit-this-campaign" affordance here, so a missing planning sends
    // the manager back to the dashboard rather than rendering a stub page.
    if (result.error === "Non autorisé." || result.error === "Campagne introuvable.") {
      redirect("/dashboard")
    }
    return (
      <div className="mx-auto max-w-2xl rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("loadFailed")}</p>
      </div>
    )
  }

  const { campaign, groupName } = result.data

  if (!campaign.optimizationResult) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("noPlanning")}</p>
      </div>
    )
  }

  return (
    <WeeklyPlanningView
      groupName={groupName}
      startDate={campaign.startDate}
      endDate={campaign.endDate}
      trainingLocation={campaign.trainingLocation.formatted}
      result={campaign.optimizationResult}
    />
  )
}
