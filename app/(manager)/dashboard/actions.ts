"use server"

import { randomUUID } from "crypto"
import { z } from "zod"
import { requireManager } from "@/lib/firebase/auth"
import { adminDb } from "@/lib/firebase/admin"
import { decryptAddress } from "@/lib/utils/encryption"
import { optimizeSlots } from "@/lib/utils/optimizer"
import { sendCampaignNotification, sendPlanningNotification } from "@/lib/utils/email"
import { revalidatePath } from "next/cache"
import type { Group, GroupAthlete } from "@/lib/types/group"
import type { Campaign } from "@/lib/types/campaign"

// Firestore doc IDs are strings of ≤1500 bytes with a limited charset. We
// intentionally keep this permissive but bounded — just enough to reject
// empty strings, absurdly long input, and path-traversal attempts.
const firestoreId = z.string().min(1).max(128).regex(/^[^/]+$/, "Identifiant invalide.")

const groupNameSchema = z.string().trim().min(1, "Le nom du groupe est requis.").max(80)

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horaire invalide.")

const campaignSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    timeRangeStart: hhmm.default("08:00"),
    timeRangeEnd: hhmm.default("20:00"),
    trainingLocationFormatted: z.string().trim().min(1, "Le lieu est requis.").max(500),
    trainingLocationLat: z.coerce.number().finite().min(-90).max(90),
    trainingLocationLng: z.coerce.number().finite().min(-180).max(180),
    deadline: z.string().min(1, "La date limite est requise."),
  })
  .refine(({ startDate, endDate }) => endDate >= startDate, {
    message: "La date de fin doit être postérieure à la date de début.",
    path: ["endDate"],
  })
  .refine(({ timeRangeStart, timeRangeEnd }) => timeRangeEnd > timeRangeStart, {
    message: "L'heure de fin doit être postérieure à l'heure de début.",
    path: ["timeRangeEnd"],
  })
  .refine(({ deadline }) => !Number.isNaN(new Date(deadline).getTime()), {
    message: "Date limite invalide.",
    path: ["deadline"],
  })

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

  const parsed = groupNameSchema.safeParse(formData.get("name"))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Nom invalide." }

  const inviteToken = randomUUID()
  const inviteTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  const ref = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups")
    .add({
      name: parsed.data,
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

  const parsedId = firestoreId.safeParse(groupId)
  if (!parsedId.success) return { error: "Identifiant de groupe invalide." }

  const parsedName = groupNameSchema.safeParse(formData.get("name"))
  if (!parsedName.success) return { error: parsedName.error.issues[0]?.message ?? "Nom invalide." }

  await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedId.data)
    .update({ name: parsedName.data })

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

  const parsedId = firestoreId.safeParse(groupId)
  if (!parsedId.success) return { error: "Identifiant de groupe invalide." }

  const parsed = campaignSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    timeRangeStart: formData.get("timeRangeStart") || undefined,
    timeRangeEnd: formData.get("timeRangeEnd") || undefined,
    trainingLocationFormatted: formData.get("trainingLocationFormatted"),
    trainingLocationLat: formData.get("trainingLocationLat"),
    trainingLocationLng: formData.get("trainingLocationLng"),
    deadline: formData.get("deadline"),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides." }
  }
  const input = parsed.data

  const campaignRef = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedId.data)
    .collection("campaigns")
    .add({
      startDate: input.startDate,
      endDate: input.endDate,
      timeRangeStart: input.timeRangeStart,
      timeRangeEnd: input.timeRangeEnd,
      trainingLocation: {
        formatted: input.trainingLocationFormatted,
        lat: input.trainingLocationLat,
        lng: input.trainingLocationLng,
      },
      status: "active",
      deadline: new Date(input.deadline),
      createdAt: new Date(),
      optimizationResult: null,
      planningStatus: "pending",
      planningStatusUpdatedAt: null,
    })

  // Send emails to all athletes in the group. Awaited in parallel so the
  // serverless function doesn't terminate before the Resend calls resolve —
  // fire-and-forget would drop messages silently.
  const athletesSnapshot = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedId.data)
    .collection("athletes")
    .get()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  await Promise.allSettled(
    athletesSnapshot.docs.map((athleteDoc) => {
      const athlete = athleteDoc.data()
      if (!athlete.email) return Promise.resolve()
      return sendCampaignNotification(athlete.email, athlete.firstName || "Athlete", {
        trainingLocation: input.trainingLocationFormatted,
        startDate: input.startDate,
        endDate: input.endDate,
        deadline: input.deadline,
        responseLink: `${appUrl}/campaign/${campaignRef.id}`,
      })
    })
  )

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

// How long an in-progress optimization can hold the lock before another
// invocation is allowed to take it over (in case the previous run crashed).
const OPTIMIZATION_STALE_LOCK_MS = 10 * 60 * 1000

export async function runOptimization(groupId: string, campaignId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const parsedGroupId = firestoreId.safeParse(groupId)
  const parsedCampaignId = firestoreId.safeParse(campaignId)
  if (!parsedGroupId.success || !parsedCampaignId.success) {
    return { error: "Identifiant invalide." }
  }

  const basePath = adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedGroupId.data)
  const campaignRef = basePath.collection("campaigns").doc(parsedCampaignId.data)

  // --- Phase 1: acquire the optimization lock atomically. A double-click
  // (or two manager sessions hitting the button at the same time) would
  // otherwise launch two optimizers, race on the Firestore write, and
  // double-send planning emails once validated.
  type LockOutcome =
    | { ok: true; campaign: FirebaseFirestore.DocumentData }
    | { ok: false; reason: string }
  const lock: LockOutcome = await adminDb.runTransaction<LockOutcome>(async (tx) => {
    const snap = await tx.get(campaignRef)
    if (!snap.exists) return { ok: false, reason: "Campagne introuvable." }
    const data = snap.data()!
    const status = data.optimizationStatus as string | undefined
    const startedAtMs = (data.optimizationStartedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0
    if (status === "running" && Date.now() - startedAtMs < OPTIMIZATION_STALE_LOCK_MS) {
      return { ok: false, reason: "Une optimisation est déjà en cours pour cette campagne." }
    }
    tx.update(campaignRef, {
      optimizationStatus: "running",
      optimizationStartedAt: new Date(),
    })
    return { ok: true, campaign: data }
  })
  if (!lock.ok) return { error: lock.reason }

  // --- Phase 2: long-running work outside the transaction. Wrap in try so
  // we always release the lock (to "failed" or "completed") even on error.
  try {
    const responsesSnapshot = await campaignRef.collection("responses").get()
    if (responsesSnapshot.empty) {
      await campaignRef.update({ optimizationStatus: "idle" })
      return { error: "Aucune réponse reçue." }
    }

    const athletesSnapshot = await basePath.collection("athletes").get()
    const athleteMap = new Map(athletesSnapshot.docs.map((d) => [d.id, d.data()]))

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
      await campaignRef.update({ optimizationStatus: "idle" })
      return {
        error: `Impossible de déchiffrer les adresses de ${corruptedAthleteIds.length} athlète(s). Profil corrompu ou clé de chiffrement changée.`,
      }
    }

    const result = await optimizeSlots(athleteDataList, {
      timeRangeStart: lock.campaign.timeRangeStart || "08:00",
      timeRangeEnd: lock.campaign.timeRangeEnd || "20:00",
      trainingLocation: lock.campaign.trainingLocation,
      managerUid: manager.uid,
      groupId: parsedGroupId.data,
      campaignId: parsedCampaignId.data,
    })

    await campaignRef.update({
      optimizationResult: JSON.parse(JSON.stringify(result)),
      planningStatus: "pending",
      optimizationStatus: "completed",
    })

    revalidatePath("/dashboard")
    return { data: result }
  } catch (error) {
    await campaignRef
      .update({
        optimizationStatus: "failed",
        optimizationError: error instanceof Error ? error.message : "Erreur inconnue",
      })
      .catch(() => {}) // don't mask the original error if we can't release the lock
    return {
      error: error instanceof Error ? error.message : "Erreur lors de l'optimisation.",
    }
  }
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
