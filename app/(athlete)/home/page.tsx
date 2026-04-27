import { redirect } from "next/navigation"
import { getSession } from "@/lib/firebase/auth"
import { readAthleteProfile } from "@/lib/server/profile-service"
import { HomeClient } from "./home-client"
import { getAthleteCampaigns } from "./actions"

export default async function AthleteHomePage() {
  const session = await getSession()
  if (!session) redirect("/athlete-login?redirect=/home")

  const profile = await readAthleteProfile(session.uid)
  // No profile = user has a session but never completed onboarding. Push them
  // back to the athlete-login landing state rather than rendering a blank page.
  if (!profile) redirect("/athlete-login")

  const campaignsResult = await getAthleteCampaigns()
  const campaigns = campaignsResult.campaigns ?? []

  return (
    <HomeClient
      email={session.email ?? ""}
      profile={{
        homeAddress: profile.homeAddress,
        schoolAddress: profile.schoolAddress,
        clubAddress: profile.clubAddress,
        constraintsGrid: profile.constraintsGrid,
      }}
      campaigns={campaigns}
    />
  )
}
