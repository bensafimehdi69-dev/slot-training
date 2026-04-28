import { redirect } from "next/navigation"
import { getSession } from "@/lib/firebase/auth"
import { adminDb } from "@/lib/firebase/admin"
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

  // Pull firstName + avatarUrl from the global athlete doc so the profile
  // header can show "Hi, {firstName}" and the upload preview without a
  // second client round-trip.
  const athleteSnap = await adminDb.collection("athletes").doc(session.uid).get()
  const athleteData = athleteSnap.data() ?? {}
  const firstName = typeof athleteData.firstName === "string" ? athleteData.firstName : undefined
  const avatarUrl = typeof athleteData.avatarUrl === "string" ? athleteData.avatarUrl : undefined

  const campaignsResult = await getAthleteCampaigns()
  const campaigns = campaignsResult.campaigns ?? []

  return (
    <HomeClient
      email={session.email ?? ""}
      firstName={firstName}
      avatarUrl={avatarUrl}
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
