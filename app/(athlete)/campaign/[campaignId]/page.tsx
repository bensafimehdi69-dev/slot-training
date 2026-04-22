import { getCampaignForAthlete } from "./actions"
import { CampaignClientPage } from "./campaign-client"

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  const { campaignId } = await params
  const result = await getCampaignForAthlete(campaignId)

  if (result.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Erreur</h1>
          <p className="mt-2 text-muted-foreground">{result.error}</p>
        </div>
      </div>
    )
  }

  const data = result.data!

  return (
    <CampaignClientPage
      campaignId={campaignId}
      campaign={{
        ...data.campaign,
        deadline: data.campaign.deadline.toISOString(),
        createdAt: data.campaign.createdAt.toISOString(),
        planningStatusUpdatedAt: data.campaign.planningStatusUpdatedAt?.toISOString() || null,
        optimizationResult: data.campaign.optimizationResult
          ? {
              ...data.campaign.optimizationResult,
              calculatedAt: data.campaign.optimizationResult.calculatedAt.toISOString(),
            }
          : null,
      }}
      existingResponse={
        data.response
          ? {
              ...data.response,
              submittedAt: data.response.submittedAt.toISOString(),
            }
          : null
      }
      profile={
        data.profile
          ? {
              ...data.profile,
              updatedAt: data.profile.updatedAt.toISOString(),
            }
          : null
      }
      athleteFirstName={data.athleteFirstName}
      athleteSlot={data.athleteSlot}
      trainingLocation={data.campaign.trainingLocation}
    />
  )
}
