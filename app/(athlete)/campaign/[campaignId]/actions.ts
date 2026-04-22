"use server"

import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { getSession } from "@/lib/firebase/auth"
import { encryptAddress, decryptAddress } from "@/lib/utils/encryption"
import { readAthleteProfile } from "@/lib/server/profile-service"
import { sendDeletionConfirmation } from "@/lib/utils/email"
import type { Campaign, CampaignResponse } from "@/lib/types/campaign"
import type { WeeklySchedule } from "@/lib/types/schedule"
import type { AddressWithCoords } from "@/lib/types/address"
import type { AthleteProfile } from "@/lib/types/profile"
import type { OptimizationResult, IndividualSlot } from "@/lib/types/planning"

interface CampaignForAthlete {
  campaign: Campaign
  response: CampaignResponse | null
  profile: AthleteProfile | null
  athleteFirstName: string
  athleteLastName: string
  athleteEmail: string
  managerUid: string
  groupId: string
  athleteSlot: {
    type: "collectif" | "individuel" | "aucun"
    day?: string
    startTime?: string
    endTime?: string
    departureTime?: string
    travelMinutes?: number
    departureAddress?: string
    trainingLocation?: string
    exclusionReason?: string
  } | null
}

export async function getCampaignForAthlete(
  campaignId: string
): Promise<{ data?: CampaignForAthlete; error?: string }> {
  try {
    const session = await getSession()
    if (!session) {
      return { error: "Non authentifie" }
    }

    const uid = session.uid

    // Use collectionGroup query to find the campaign by ID
    const campaignsQuery = adminDb.collectionGroup("campaigns").where("__name__", "==", campaignId)
    // collectionGroup where __name__ won't work for doc IDs directly
    // Instead, we search across all managers' groups
    const managersSnapshot = await adminDb.collection("managers").get()

    let campaignData: Campaign | null = null
    let managerUid = ""
    let groupId = ""
    let campaignRef: FirebaseFirestore.DocumentReference | null = null

    for (const managerDoc of managersSnapshot.docs) {
      const groupsSnapshot = await managerDoc.ref.collection("groups").get()
      for (const groupDoc of groupsSnapshot.docs) {
        const campDoc = await groupDoc.ref
          .collection("campaigns")
          .doc(campaignId)
          .get()
        if (campDoc.exists) {
          const data = campDoc.data()!
          campaignData = {
            id: campDoc.id,
            startDate: data.startDate,
            endDate: data.endDate,
            timeRangeStart: data.timeRangeStart,
            timeRangeEnd: data.timeRangeEnd,
            trainingLocation: data.trainingLocation,
            status: data.status,
            deadline: data.deadline?.toDate() || new Date(),
            createdAt: data.createdAt?.toDate() || new Date(),
            optimizationResult: data.optimizationResult
              ? deserializeOptimizationResult(data.optimizationResult)
              : null,
            planningStatus: data.planningStatus || "pending",
            planningStatusUpdatedAt: data.planningStatusUpdatedAt?.toDate() || null,
          }
          managerUid = managerDoc.id
          groupId = groupDoc.id
          campaignRef = campDoc.ref
          break
        }
      }
      if (campaignData) break
    }

    void campaignsQuery // suppress unused variable

    if (!campaignData || !campaignRef) {
      return { error: "Campagne introuvable." }
    }

    // Get athlete info from the group
    const athleteDoc = await adminDb
      .collection("managers")
      .doc(managerUid)
      .collection("groups")
      .doc(groupId)
      .collection("athletes")
      .doc(uid)
      .get()

    if (!athleteDoc.exists) {
      return { error: "Vous ne faites pas partie de ce groupe." }
    }

    const athleteData = athleteDoc.data()!

    // Check for existing response
    const responseDoc = await campaignRef
      .collection("responses")
      .doc(uid)
      .get()

    let response: CampaignResponse | null = null
    if (responseDoc.exists) {
      const rData = responseDoc.data()!
      response = {
        athleteId: uid,
        schedule: rData.schedule,
        homeAddress: rData.homeAddress,
        schoolAddress: rData.schoolAddress,
        constraints: rData.constraints || "",
        submittedAt: rData.submittedAt?.toDate() || new Date(),
      }
    }

    // Get athlete profile for pre-filling. uid comes from the verified
    // session above, so reading via the internal helper is safe.
    const profile = await readAthleteProfile(uid)

    // Find athlete's assigned slot if planning is validated
    let athleteSlot: CampaignForAthlete["athleteSlot"] = null
    if (campaignData.planningStatus === "validated" && campaignData.optimizationResult) {
      athleteSlot = findAthleteSlot(
        uid,
        campaignData.optimizationResult,
        campaignData.trainingLocation.formatted
      )
    }

    return {
      data: {
        campaign: campaignData,
        response,
        profile,
        athleteFirstName: athleteData.firstName || "",
        athleteLastName: athleteData.lastName || "",
        athleteEmail: athleteData.email || session.email || "",
        managerUid,
        groupId,
        athleteSlot,
      },
    }
  } catch (error) {
    console.error("[CAMPAIGN] Error fetching campaign for athlete:", error)
    return { error: "Une erreur est survenue." }
  }
}

export async function submitCampaignResponse(
  campaignId: string,
  data: {
    schedule: WeeklySchedule
    homeAddress: AddressWithCoords
    schoolAddress: AddressWithCoords | null
    constraints: string
  }
): Promise<{ success?: boolean; error?: string }> {
  try {
    const session = await getSession()
    if (!session) {
      return { error: "Non authentifie" }
    }

    const uid = session.uid

    // Find the campaign
    const managersSnapshot = await adminDb.collection("managers").get()
    let campaignRef: FirebaseFirestore.DocumentReference | null = null
    let campaignStatus = ""

    for (const managerDoc of managersSnapshot.docs) {
      const groupsSnapshot = await managerDoc.ref.collection("groups").get()
      for (const groupDoc of groupsSnapshot.docs) {
        const campDoc = await groupDoc.ref
          .collection("campaigns")
          .doc(campaignId)
          .get()
        if (campDoc.exists) {
          campaignRef = campDoc.ref
          campaignStatus = campDoc.data()!.status
          break
        }
      }
      if (campaignRef) break
    }

    if (!campaignRef) {
      return { error: "Campagne introuvable." }
    }

    if (campaignStatus === "closed") {
      return { error: "Cette campagne est cloturee." }
    }

    // Encrypt addresses
    const encryptedHome = encryptAddress(data.homeAddress)
    const encryptedSchool = data.schoolAddress
      ? encryptAddress(data.schoolAddress)
      : ""

    // Save response
    await campaignRef.collection("responses").doc(uid).set({
      athleteId: uid,
      schedule: data.schedule,
      homeAddress: encryptedHome,
      schoolAddress: encryptedSchool,
      constraints: data.constraints.slice(0, 2000),
      submittedAt: new Date(),
    })

    return { success: true }
  } catch (error) {
    console.error("[CAMPAIGN] Error submitting response:", error)
    return { error: "Une erreur est survenue lors de l'envoi." }
  }
}

export async function deleteAthleteData(
  campaignId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const session = await getSession()
    if (!session) {
      return { error: "Non authentifie" }
    }

    const uid = session.uid
    const email = session.email || ""

    // Find the campaign to get managerUid and groupId
    const managersSnapshot = await adminDb.collection("managers").get()
    let managerUid = ""
    let groupId = ""
    let campaignRef: FirebaseFirestore.DocumentReference | null = null
    let athleteFirstName = ""

    for (const managerDoc of managersSnapshot.docs) {
      const groupsSnapshot = await managerDoc.ref.collection("groups").get()
      for (const groupDoc of groupsSnapshot.docs) {
        const campDoc = await groupDoc.ref
          .collection("campaigns")
          .doc(campaignId)
          .get()
        if (campDoc.exists) {
          managerUid = managerDoc.id
          groupId = groupDoc.id
          campaignRef = campDoc.ref

          // Get athlete name for email
          const athleteDoc = await groupDoc.ref
            .collection("athletes")
            .doc(uid)
            .get()
          if (athleteDoc.exists) {
            athleteFirstName = athleteDoc.data()!.firstName || ""
          }
          break
        }
      }
      if (campaignRef) break
    }

    if (!campaignRef || !managerUid || !groupId) {
      return { error: "Campagne introuvable." }
    }

    // 1. Delete the athlete's response in the campaign (if any)
    const responseRef = campaignRef.collection("responses").doc(uid)
    const responseDoc = await responseRef.get()
    if (responseDoc.exists) {
      await responseRef.delete()
    }

    // 2. Delete the athlete's profile in /athletes/{uid}
    const profileRef = adminDb.collection("athletes").doc(uid)
    const profileDoc = await profileRef.get()
    if (profileDoc.exists) {
      await profileRef.delete()
    }

    // 3. Delete the athlete's record in the group's athletes subcollection
    const groupAthleteRef = adminDb
      .collection("managers")
      .doc(managerUid)
      .collection("groups")
      .doc(groupId)
      .collection("athletes")
      .doc(uid)
    const groupAthleteDoc = await groupAthleteRef.get()
    if (groupAthleteDoc.exists) {
      await groupAthleteRef.delete()
    }

    // 4. Delete the Firebase Auth account
    try {
      await adminAuth.deleteUser(uid)
    } catch (authError) {
      console.error("[GDPR] Error deleting auth account:", authError)
    }

    // 5. Send deletion confirmation email
    if (email) {
      await sendDeletionConfirmation(email, athleteFirstName || "Athlete")
    }

    return { success: true }
  } catch (error) {
    console.error("[GDPR] Error deleting athlete data:", error)
    return { error: "Une erreur est survenue lors de la suppression." }
  }
}

// Helper function to find an athlete's assigned slot
function findAthleteSlot(
  athleteId: string,
  result: OptimizationResult,
  trainingLocation: string
): CampaignForAthlete["athleteSlot"] {
  // Check if athlete is in the best collective slot
  const bestSlot = result.bestSlot
  if (bestSlot) {
    const inCollective = bestSlot.availableAthletes.find(
      (a) => a.athleteId === athleteId
    )
    if (inCollective) {
      return {
        type: "collectif",
        day: bestSlot.day,
        startTime: bestSlot.startTime,
        endTime: bestSlot.endTime,
        departureTime: inCollective.departureTime,
        travelMinutes: inCollective.travelMinutes,
        departureAddress: inCollective.departureAddress,
        trainingLocation,
      }
    }
  }

  // Check if athlete has an individual slot
  if (result.individualSlots) {
    const individualSlot = result.individualSlots.find(
      (s: IndividualSlot) => s.athleteId === athleteId
    )
    if (individualSlot) {
      return {
        type: "individuel",
        day: individualSlot.day,
        startTime: individualSlot.startTime,
        endTime: individualSlot.endTime,
        departureTime: individualSlot.departureTime,
        travelMinutes: individualSlot.travelMinutes,
        departureAddress: individualSlot.departureAddress,
        trainingLocation,
        exclusionReason: individualSlot.exclusionReason,
      }
    }
  }

  // No slot assigned
  return {
    type: "aucun",
    trainingLocation,
  }
}

function deserializeOptimizationResult(data: Record<string, unknown>): OptimizationResult {
  const raw = data as Record<string, unknown>
  return {
    bestSlot: raw.bestSlot as OptimizationResult["bestSlot"],
    individualSlots: (raw.individualSlots || []) as OptimizationResult["individualSlots"],
    allSlots: (raw.allSlots || []) as OptimizationResult["allSlots"],
    calculatedAt: (raw.calculatedAt as { toDate?: () => Date })?.toDate?.() || new Date(),
  }
}
