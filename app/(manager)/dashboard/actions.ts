"use server"

import { randomUUID } from "crypto"
import { z } from "zod"
import { requireManager } from "@/lib/firebase/auth"
import { adminDb } from "@/lib/firebase/admin"
import { decryptAddress } from "@/lib/utils/encryption"
import { optimizeSlots } from "@/lib/utils/optimizer"
import {
  sendCampaignNotification,
  sendCampaignUpdatedNotification,
  sendCampaignDeletedNotification,
  sendPlanningNotification,
} from "@/lib/utils/email"
import {
  writeInviteIndex,
  deleteInviteIndex,
  writeCampaignIndex,
  deleteCampaignIndex,
  deleteIndexesForGroup,
} from "@/lib/server/indexes"
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

// Coach + facility availability grid. Match the athlete schema exactly so the
// same UI component can render either side. 7 days × 16 hours of booleans;
// `true` = coach and room are available, `false` = blocked (training cannot
// happen here regardless of athlete availability).
const AVAILABILITY_DAYS = 7
const AVAILABILITY_HOURS = 16
const availableSlotsSchema = z
  .array(z.array(z.boolean()).length(AVAILABILITY_HOURS))
  .length(AVAILABILITY_DAYS)

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
    availableSlots: availableSlotsSchema,
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

  // Reverse index so /invite/[token] and validateInviteToken can do an O(1)
  // lookup instead of scanning every manager.
  await writeInviteIndex(inviteToken, {
    managerUid: manager.uid,
    groupId: ref.id,
    expiresAt: inviteTokenExpiresAt,
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

  const parsedId = firestoreId.safeParse(groupId)
  if (!parsedId.success) return { error: "Identifiant de groupe invalide." }

  const groupRef = adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedId.data)

  // Clean the top-level reverse indexes BEFORE recursiveDelete — those
  // collections are outside the group sub-tree and would otherwise be
  // orphaned, still pointing at paths that no longer exist.
  await deleteIndexesForGroup(manager.uid, parsedId.data)

  // Recursively delete the group and every sub-collection (athletes,
  // campaigns, each campaign's responses AND travelTimes cache).
  await adminDb.recursiveDelete(groupRef)

  revalidatePath("/dashboard")
  return { success: true }
}

export async function regenerateInviteToken(groupId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const parsedId = firestoreId.safeParse(groupId)
  if (!parsedId.success) return { error: "Identifiant de groupe invalide." }

  const groupRef = adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedId.data)

  // Read the old token so we can retire its index entry. If the group is
  // missing we bail before minting a new token.
  const groupSnap = await groupRef.get()
  if (!groupSnap.exists) return { error: "Groupe introuvable." }
  const oldToken = groupSnap.data()?.inviteToken as string | undefined

  const inviteToken = randomUUID()
  const inviteTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  await groupRef.update({ inviteToken, inviteTokenExpiresAt })

  if (oldToken && oldToken !== inviteToken) {
    await deleteInviteIndex(oldToken)
  }
  await writeInviteIndex(inviteToken, {
    managerUid: manager.uid,
    groupId: parsedId.data,
    expiresAt: inviteTokenExpiresAt,
  })

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

  // Explicit field picking — never spread doc.data(). Firestore Timestamps
  // are class instances and Next.js 16 rejects them when a server component
  // forwards an unconverted one to a client component. The \`optimizationStartedAt\`
  // timestamp used to leak through the spread and crash the dashboard.
  const campaigns: Campaign[] = snapshot.docs.map((doc) => {
    const data = doc.data()
    const rawResult = data.optimizationResult as Record<string, unknown> | null | undefined

    // availableSlots is stored as a JSON string; legacy campaigns predating
    // this field default to "all hours allowed" so optimisation still works.
    let availableSlots: boolean[][] = Array(AVAILABILITY_DAYS)
      .fill(null)
      .map(() => Array(AVAILABILITY_HOURS).fill(true))
    if (typeof data.availableSlots === "string") {
      try {
        const parsed = JSON.parse(data.availableSlots)
        if (Array.isArray(parsed)) availableSlots = parsed as boolean[][]
      } catch {
        // Keep the default-true fallback.
      }
    }

    return {
      id: doc.id,
      startDate: data.startDate,
      endDate: data.endDate,
      timeRangeStart: data.timeRangeStart,
      timeRangeEnd: data.timeRangeEnd,
      trainingLocation: data.trainingLocation,
      availableSlots,
      status: data.status,
      deadline: data.deadline?.toDate() ?? new Date(),
      createdAt: data.createdAt?.toDate() ?? new Date(),
      optimizationResult: rawResult
        ? ({
            dailyPlannings: rawResult.dailyPlannings ?? [],
            bestSlot: rawResult.bestSlot,
            individualSlots: rawResult.individualSlots ?? [],
            allSlots: rawResult.allSlots ?? [],
            calculatedAt:
              (rawResult.calculatedAt as { toDate?: () => Date } | undefined)?.toDate?.() ??
              new Date(),
          } as Campaign["optimizationResult"])
        : null,
      planningStatus: data.planningStatus ?? "pending",
      planningStatusUpdatedAt: data.planningStatusUpdatedAt?.toDate() ?? null,
    } as Campaign
  })

  return { data: campaigns }
}

export async function createCampaign(groupId: string, formData: FormData) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const parsedId = firestoreId.safeParse(groupId)
  if (!parsedId.success) return { error: "Identifiant de groupe invalide." }

  // availableSlots arrives as a JSON-encoded 7×16 grid in the form payload.
  // Reject early if it isn't valid JSON so Zod sees a clean array.
  let availableSlotsRaw: unknown = undefined
  const availableSlotsField = formData.get("availableSlots")
  if (typeof availableSlotsField === "string" && availableSlotsField.length > 0) {
    try {
      availableSlotsRaw = JSON.parse(availableSlotsField)
    } catch {
      return { error: "Créneaux dispos invalides." }
    }
  }

  const parsed = campaignSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    timeRangeStart: formData.get("timeRangeStart") || undefined,
    timeRangeEnd: formData.get("timeRangeEnd") || undefined,
    trainingLocationFormatted: formData.get("trainingLocationFormatted"),
    trainingLocationLat: formData.get("trainingLocationLat"),
    trainingLocationLng: formData.get("trainingLocationLng"),
    deadline: formData.get("deadline"),
    availableSlots: availableSlotsRaw,
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
      availableSlots: JSON.stringify(input.availableSlots),
    })

  // Reverse index so athlete-facing lookups can resolve campaignId → path
  // in one read instead of scanning every manager.
  await writeCampaignIndex(campaignRef.id, {
    managerUid: manager.uid,
    groupId: parsedId.data,
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

export async function updateCampaign(
  groupId: string,
  campaignId: string,
  formData: FormData
) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const parsedGroupId = firestoreId.safeParse(groupId)
  const parsedCampaignId = firestoreId.safeParse(campaignId)
  if (!parsedGroupId.success || !parsedCampaignId.success) {
    return { error: "Identifiant invalide." }
  }

  let availableSlotsRaw: unknown = undefined
  const availableSlotsField = formData.get("availableSlots")
  if (typeof availableSlotsField === "string" && availableSlotsField.length > 0) {
    try {
      availableSlotsRaw = JSON.parse(availableSlotsField)
    } catch {
      return { error: "Créneaux dispos invalides." }
    }
  }

  const parsed = campaignSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    timeRangeStart: formData.get("timeRangeStart") || undefined,
    timeRangeEnd: formData.get("timeRangeEnd") || undefined,
    trainingLocationFormatted: formData.get("trainingLocationFormatted"),
    trainingLocationLat: formData.get("trainingLocationLat"),
    trainingLocationLng: formData.get("trainingLocationLng"),
    deadline: formData.get("deadline"),
    availableSlots: availableSlotsRaw,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides." }
  }
  const input = parsed.data

  const campaignRef = adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedGroupId.data)
    .collection("campaigns").doc(parsedCampaignId.data)

  const snap = await campaignRef.get()
  if (!snap.exists) return { error: "Campagne introuvable." }

  // Editing parameters invalidates any prior optimisation — Distance Matrix
  // results depend on the training location and the schedule windows. Wipe
  // the result and the travel-time cache so the next \`runOptimization\` call
  // recomputes everything from scratch.
  await campaignRef.update({
    startDate: input.startDate,
    endDate: input.endDate,
    timeRangeStart: input.timeRangeStart,
    timeRangeEnd: input.timeRangeEnd,
    trainingLocation: {
      formatted: input.trainingLocationFormatted,
      lat: input.trainingLocationLat,
      lng: input.trainingLocationLng,
    },
    deadline: new Date(input.deadline),
    availableSlots: JSON.stringify(input.availableSlots),
    optimizationResult: null,
    optimizationStatus: "idle",
    planningStatus: "pending",
    planningStatusUpdatedAt: null,
  })

  // Clear the travel cache subcollection — best-effort; small deck so a
  // single page is plenty in practice.
  try {
    const travelSnap = await campaignRef.collection("travelTimes").get()
    if (!travelSnap.empty) {
      const batch = adminDb.batch()
      for (const doc of travelSnap.docs) batch.delete(doc.ref)
      await batch.commit()
    }
  } catch (error) {
    console.error("[CAMPAIGN] travelTimes wipe failed:", error instanceof Error ? error.message : "unknown")
  }

  // Notify everyone in the group — even athletes who haven't responded yet —
  // so they can adjust before the new deadline.
  const athletesSnapshot = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedGroupId.data)
    .collection("athletes")
    .get()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  await Promise.allSettled(
    athletesSnapshot.docs.map((athleteDoc) => {
      const athlete = athleteDoc.data()
      if (!athlete.email) return Promise.resolve()
      return sendCampaignUpdatedNotification(athlete.email, athlete.firstName || "Athlete", {
        trainingLocation: input.trainingLocationFormatted,
        startDate: input.startDate,
        endDate: input.endDate,
        deadline: input.deadline,
        responseLink: `${appUrl}/campaign/${parsedCampaignId.data}`,
      })
    })
  )

  revalidatePath("/dashboard")
  return { success: true }
}

export async function deleteCampaign(groupId: string, campaignId: string) {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const parsedGroupId = firestoreId.safeParse(groupId)
  const parsedCampaignId = firestoreId.safeParse(campaignId)
  if (!parsedGroupId.success || !parsedCampaignId.success) {
    return { error: "Identifiant invalide." }
  }

  const campaignRef = adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedGroupId.data)
    .collection("campaigns").doc(parsedCampaignId.data)

  const snap = await campaignRef.get()
  if (!snap.exists) return { error: "Campagne introuvable." }
  const data = snap.data()!

  // Notify athletes BEFORE the data is gone so we can still read their
  // emails from the group's athletes subcollection.
  const athletesSnapshot = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedGroupId.data)
    .collection("athletes")
    .get()

  await Promise.allSettled(
    athletesSnapshot.docs.map((athleteDoc) => {
      const athlete = athleteDoc.data()
      if (!athlete.email) return Promise.resolve()
      return sendCampaignDeletedNotification(athlete.email, athlete.firstName || "Athlete", {
        startDate: data.startDate,
        endDate: data.endDate,
      })
    })
  )

  // Wipe the campaign tree (responses, travelTimes, the campaign doc itself)
  // and the reverse index. Use Firestore's recursiveDelete to avoid leaving
  // orphan subcollections.
  await adminDb.recursiveDelete(campaignRef)
  await deleteCampaignIndex(parsedCampaignId.data)

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

    // Decode the coach/facility availability grid. Stored as a JSON string in
    // Firestore; legacy campaigns have nothing here, so default to "all hours
    // allowed" (a 7×16 boolean[][] of true).
    let availableSlots: boolean[][] = Array(AVAILABILITY_DAYS)
      .fill(null)
      .map(() => Array(AVAILABILITY_HOURS).fill(true))
    if (typeof lock.campaign.availableSlots === "string") {
      try {
        const parsed = JSON.parse(lock.campaign.availableSlots)
        if (Array.isArray(parsed)) availableSlots = parsed as boolean[][]
      } catch {
        // Keep default-permissive fallback rather than block the optimisation.
      }
    }

    const result = await optimizeSlots(athleteDataList, {
      timeRangeStart: lock.campaign.timeRangeStart || "08:00",
      timeRangeEnd: lock.campaign.timeRangeEnd || "20:00",
      trainingLocation: lock.campaign.trainingLocation,
      availableSlots,
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

    // Build the full list of email tasks then `Promise.allSettled` them in a
    // single fan-out. Sequential fire-and-forget (previous code) could be
    // cut short by the serverless function terminating before the last
    // Resend calls resolved; awaiting each one sequentially would balloon
    // the response time linearly with group size.
    const tasks: Array<Promise<unknown>> = []

    // Collective slot
    for (const athlete of optimResult.bestSlot.availableAthletes) {
      const info = athleteMap.get(athlete.athleteId)
      if (!info?.email) continue
      tasks.push(
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
      )
    }

    // Individual slots
    for (const indiv of optimResult.individualSlots || []) {
      const info = athleteMap.get(indiv.athleteId)
      if (!info?.email) continue
      tasks.push(
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
      )
    }

    // No-slot emails for athletes with neither a collective nor an individual slot
    for (const excluded of optimResult.bestSlot.unavailableAthletes) {
      const hasIndividual = optimResult.individualSlots?.some(
        (i: { athleteId: string }) => i.athleteId === excluded.athleteId
      )
      if (hasIndividual) continue
      const info = athleteMap.get(excluded.athleteId)
      if (!info?.email) continue
      tasks.push(
        sendPlanningNotification(info.email, info.firstName || "Athlete", {
          slotType: "aucun",
          trainingLocation: campaign.trainingLocation.formatted,
          reason: excluded.reason,
          planningLink: `${appUrl}/campaign/${campaignId}`,
        })
      )
    }

    await Promise.allSettled(tasks)
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
