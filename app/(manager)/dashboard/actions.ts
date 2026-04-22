"use server"

import { randomUUID } from "crypto"
import { requireManager } from "@/lib/firebase/auth"
import { adminDb } from "@/lib/firebase/admin"
import { decryptAddress } from "@/lib/utils/encryption"
import { optimizeSlots } from "@/lib/utils/optimizer"
import { sendCampaignNotification, sendPlanningNotification } from "@/lib/utils/email"
import { revalidatePath } from "next/cache"
import type { Group, GroupAthlete } from "@/lib/types/group"
import type { Campaign } from "@/lib/types/campaign"

// ============ GROUP ACTIONS ============

export async function getGroups() {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const snapshot = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups")
    .orderBy("createdAt", "desc")
    .get()

  const groups: Group[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate(),
    inviteTokenExpiresAt: doc.data().inviteTokenExpiresAt?.toDate(),
  })) as Group[]

  return { data: groups }
}

export async function createGroup(formData: FormData) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const name = formData.get("name") as string
  if (!name?.trim()) return { error: "Le nom du groupe est requis." }

  const inviteToken = randomUUID()
  const inviteTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  const ref = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups")
    .add({
      name: name.trim(),
      createdAt: new Date(),
      inviteToken,
      inviteTokenExpiresAt,
    })

  revalidatePath("/dashboard")
  return { data: { id: ref.id } }
}

export async function updateGroup(groupId: string, formData: FormData) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const name = formData.get("name") as string
  if (!name?.trim()) return { error: "Le nom du groupe est requis." }

  await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)
    .update({ name: name.trim() })

  revalidatePath("/dashboard")
  return { success: true }
}

export async function deleteGroup(groupId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const groupRef = adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)

  // Delete sub-collections: athletes, campaigns (and their responses)
  const athletesSnap = await groupRef.collection("athletes").get()
  for (const doc of athletesSnap.docs) await doc.ref.delete()

  const campaignsSnap = await groupRef.collection("campaigns").get()
  for (const campDoc of campaignsSnap.docs) {
    const responsesSnap = await campDoc.ref.collection("responses").get()
    for (const respDoc of responsesSnap.docs) await respDoc.ref.delete()
    await campDoc.ref.delete()
  }

  await groupRef.delete()

  revalidatePath("/dashboard")
  return { success: true }
}

export async function regenerateInviteToken(groupId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const inviteToken = randomUUID()
  const inviteTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)
    .update({ inviteToken, inviteTokenExpiresAt })

  revalidatePath("/dashboard")
  return { success: true }
}

export async function getGroupAthletes(groupId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const snapshot = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)
    .collection("athletes")
    .orderBy("createdAt", "desc")
    .get()

  const athletes: GroupAthlete[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate(),
  })) as GroupAthlete[]

  return { data: athletes }
}

export async function removeAthlete(groupId: string, athleteId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)
    .collection("athletes").doc(athleteId)
    .delete()

  revalidatePath("/dashboard")
  return { success: true }
}

// ============ CAMPAIGN ACTIONS ============

export async function getCampaigns(groupId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const snapshot = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)
    .collection("campaigns")
    .orderBy("createdAt", "desc")
    .get()

  const campaigns: Campaign[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate(),
    deadline: doc.data().deadline?.toDate(),
    planningStatusUpdatedAt: doc.data().planningStatusUpdatedAt?.toDate() || null,
  })) as Campaign[]

  return { data: campaigns }
}

export async function createCampaign(groupId: string, formData: FormData) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const startDate = formData.get("startDate") as string
  const endDate = formData.get("endDate") as string
  const timeRangeStart = (formData.get("timeRangeStart") as string) || "08:00"
  const timeRangeEnd = (formData.get("timeRangeEnd") as string) || "20:00"
  const trainingLocationFormatted = formData.get("trainingLocationFormatted") as string
  const trainingLocationLat = parseFloat(formData.get("trainingLocationLat") as string)
  const trainingLocationLng = parseFloat(formData.get("trainingLocationLng") as string)
  const deadline = formData.get("deadline") as string

  if (!startDate || !endDate || !trainingLocationFormatted || !deadline) {
    return { error: "Tous les champs sont requis." }
  }

  const campaignRef = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)
    .collection("campaigns")
    .add({
      startDate,
      endDate,
      timeRangeStart,
      timeRangeEnd,
      trainingLocation: {
        formatted: trainingLocationFormatted,
        lat: trainingLocationLat,
        lng: trainingLocationLng,
      },
      status: "active",
      deadline: new Date(deadline),
      createdAt: new Date(),
      optimizationResult: null,
      planningStatus: "pending",
      planningStatusUpdatedAt: null,
    })

  // Send emails to all athletes in the group
  const athletesSnapshot = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)
    .collection("athletes")
    .get()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  for (const athleteDoc of athletesSnapshot.docs) {
    const athlete = athleteDoc.data()
    if (athlete.email) {
      sendCampaignNotification(athlete.email, athlete.firstName || "Athlete", {
        trainingLocation: trainingLocationFormatted,
        startDate,
        endDate,
        deadline,
        responseLink: `${appUrl}/campaign/${campaignRef.id}`,
      })
    }
  }

  revalidatePath("/dashboard")
  return { data: { id: campaignRef.id } }
}

export async function closeCampaign(groupId: string, campaignId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)
    .collection("campaigns").doc(campaignId)
    .update({ status: "closed" })

  revalidatePath("/dashboard")
  return { success: true }
}

export async function runOptimization(groupId: string, campaignId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const basePath = adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)

  // Get campaign
  const campaignDoc = await basePath.collection("campaigns").doc(campaignId).get()
  if (!campaignDoc.exists) return { error: "Campagne introuvable." }
  const campaign = campaignDoc.data()!

  // Get responses
  const responsesSnapshot = await basePath
    .collection("campaigns").doc(campaignId)
    .collection("responses")
    .get()

  if (responsesSnapshot.empty) return { error: "Aucune reponse recue." }

  // Get athletes info
  const athletesSnapshot = await basePath.collection("athletes").get()
  const athleteMap = new Map(athletesSnapshot.docs.map((d) => [d.id, d.data()]))

  // Build athlete data for optimizer. Abort the whole run on any decryption
  // failure — silently coercing to (0, 0) would produce nonsense travel times
  // and silently-wrong optimization results. Surface the failure to the manager.
  const corruptedAthleteIds: string[] = []
  const athleteDataList = responsesSnapshot.docs.map((doc) => {
    const response = doc.data()
    const athleteInfo = athleteMap.get(doc.id)

    let homeAddress = { formatted: "", lat: 0, lng: 0 }
    let schoolAddress = null

    try {
      if (response.homeAddress) homeAddress = decryptAddress(response.homeAddress)
      if (response.schoolAddress) schoolAddress = decryptAddress(response.schoolAddress)
    } catch {
      corruptedAthleteIds.push(doc.id)
    }

    return {
      athleteId: doc.id,
      firstName: athleteInfo?.firstName || "Inconnu",
      lastName: athleteInfo?.lastName || "",
      schedule: response.schedule || {},
      homeAddress,
      schoolAddress,
    }
  })

  if (corruptedAthleteIds.length > 0) {
    return {
      error: `Impossible de déchiffrer les adresses de ${corruptedAthleteIds.length} athlète(s). Profil corrompu ou clé de chiffrement changée.`,
    }
  }

  const result = await optimizeSlots(athleteDataList, {
    timeRangeStart: campaign.timeRangeStart || "08:00",
    timeRangeEnd: campaign.timeRangeEnd || "20:00",
    trainingLocation: campaign.trainingLocation,
    managerUid: manager.uid,
    groupId,
    campaignId,
  })

  await basePath.collection("campaigns").doc(campaignId).update({
    optimizationResult: JSON.parse(JSON.stringify(result)),
    planningStatus: "pending",
  })

  revalidatePath("/dashboard")
  return { data: result }
}

export async function validatePlanning(groupId: string, campaignId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const basePath = adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)

  await basePath.collection("campaigns").doc(campaignId).update({
    planningStatus: "validated",
    planningStatusUpdatedAt: new Date(),
  })

  // Get campaign for training location
  const campaignDoc = await basePath.collection("campaigns").doc(campaignId).get()
  const campaign = campaignDoc.data()!
  const optimResult = campaign.optimizationResult

  if (optimResult?.bestSlot) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const athletesSnapshot = await basePath.collection("athletes").get()
    const athleteMap = new Map(athletesSnapshot.docs.map((d) => [d.id, d.data()]))

    // Send email to available athletes
    for (const athlete of optimResult.bestSlot.availableAthletes) {
      const info = athleteMap.get(athlete.athleteId)
      if (info?.email) {
        sendPlanningNotification(info.email, info.firstName || "Athlete", {
          slotType: "collectif",
          day: optimResult.bestSlot.day,
          startTime: optimResult.bestSlot.startTime,
          endTime: optimResult.bestSlot.endTime,
          departureTime: athlete.departureTime,
          travelEstimate: athlete.travelMinutes ? `${athlete.travelMinutes} min` : undefined,
          trainingLocation: campaign.trainingLocation.formatted,
          planningLink: `${appUrl}/campaign/${campaignId}`,
        })
      }
    }

    // Send email to athletes with individual slots
    for (const indiv of optimResult.individualSlots || []) {
      const info = athleteMap.get(indiv.athleteId)
      if (info?.email) {
        sendPlanningNotification(info.email, info.firstName || "Athlete", {
          slotType: "individuel",
          day: indiv.day,
          startTime: indiv.startTime,
          endTime: indiv.endTime,
          departureTime: indiv.departureTime,
          travelEstimate: indiv.travelMinutes ? `${indiv.travelMinutes} min` : undefined,
          trainingLocation: campaign.trainingLocation.formatted,
          planningLink: `${appUrl}/campaign/${campaignId}`,
        })
      }
    }

    // Send "no slot" email to truly excluded athletes
    for (const excluded of optimResult.bestSlot.unavailableAthletes) {
      const hasIndividual = optimResult.individualSlots?.some(
        (i: { athleteId: string }) => i.athleteId === excluded.athleteId
      )
      if (!hasIndividual) {
        const info = athleteMap.get(excluded.athleteId)
        if (info?.email) {
          sendPlanningNotification(info.email, info.firstName || "Athlete", {
            slotType: "aucun",
            trainingLocation: campaign.trainingLocation.formatted,
            reason: excluded.reason,
            planningLink: `${appUrl}/campaign/${campaignId}`,
          })
        }
      }
    }
  }

  revalidatePath("/dashboard")
  return { success: true }
}

export async function rejectPlanning(groupId: string, campaignId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)
    .collection("campaigns").doc(campaignId)
    .update({
      optimizationResult: null,
      planningStatus: "rejected",
      planningStatusUpdatedAt: new Date(),
    })

  revalidatePath("/dashboard")
  return { success: true }
}

export async function getResponseCount(groupId: string, campaignId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const snapshot = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)
    .collection("campaigns").doc(campaignId)
    .collection("responses")
    .get()

  return { data: snapshot.size }
}
