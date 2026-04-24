"use server"

import { z } from "zod"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { getSession } from "@/lib/firebase/auth"
import { encryptAddress } from "@/lib/utils/encryption"
import { readAthleteProfile } from "@/lib/server/profile-service"
import { readCampaignIndex } from "@/lib/server/indexes"
import { sendDeletionConfirmation } from "@/lib/utils/email"
import { addressSchema } from "@/lib/types/address"
import { dayKeys } from "@/lib/types/schedule"
import type { Campaign, CampaignResponse } from "@/lib/types/campaign"
import type { AthleteProfile } from "@/lib/types/profile"
import type { OptimizationResult, IndividualSlot } from "@/lib/types/planning"

// Firestore doc IDs are strings of ≤1500 bytes — bound aggressively and
// reject path-traversal attempts.
const firestoreId = z.string().min(1).max(128).regex(/^[^/]+$/, "Identifiant invalide.")

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horaire invalide.")

// WeeklySchedule keyed by dayKeys — each day holds a list of HH:MM class
// start times. Reject unknown keys so a malicious client can't inflate the
// payload or inject extra data that downstream code might index on.
const weeklyScheduleSchema = z.object(
  Object.fromEntries(dayKeys.map((k) => [k, z.array(hhmm).max(24)])) as Record<
    (typeof dayKeys)[number],
    z.ZodArray<typeof hhmm>
  >
)

const submitResponseSchema = z.object({
  schedule: weeklyScheduleSchema,
  homeAddress: addressSchema,
  schoolAddress: addressSchema.nullable(),
  constraints: z.string().max(2000),
})

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
    if (!session) return { error: "Non authentifié." }
    const uid = session.uid

    const parsedId = firestoreId.safeParse(campaignId)
    if (!parsedId.success) return { error: "Identifiant de campagne invalide." }

    // O(1) reverse-index lookup instead of scanning every manager.
    const index = await readCampaignIndex(parsedId.data)
    if (!index) return { error: "Campagne introuvable." }

    const campaignRef = adminDb
      .collection("managers").doc(index.managerUid)
      .collection("groups").doc(index.groupId)
      .collection("campaigns").doc(parsedId.data)

    const campDoc = await campaignRef.get()
    if (!campDoc.exists) return { error: "Campagne introuvable." }

    const managerUid = index.managerUid
    const groupId = index.groupId
    const data = campDoc.data()!
    // availableSlots is a coach/facility concern; the athlete side just
    // mirrors the field for typing. Default to all-true for legacy campaigns.
    let availableSlots: boolean[][] = Array(7)
      .fill(null)
      .map(() => Array(16).fill(true))
    if (typeof data.availableSlots === "string") {
      try {
        const parsed = JSON.parse(data.availableSlots)
        if (Array.isArray(parsed)) availableSlots = parsed as boolean[][]
      } catch {
        // Keep default
      }
    }
    const campaignData: Campaign = {
      id: campDoc.id,
      startDate: data.startDate,
      endDate: data.endDate,
      timeRangeStart: data.timeRangeStart,
      timeRangeEnd: data.timeRangeEnd,
      trainingLocation: data.trainingLocation,
      availableSlots,
      status: data.status,
      deadline: data.deadline?.toDate() || new Date(),
      createdAt: data.createdAt?.toDate() || new Date(),
      optimizationResult: data.optimizationResult
        ? deserializeOptimizationResult(data.optimizationResult)
        : null,
      planningStatus: data.planningStatus || "pending",
      planningStatusUpdatedAt: data.planningStatusUpdatedAt?.toDate() || null,
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
    console.error("[CAMPAIGN] getCampaignForAthlete failed:", error instanceof Error ? error.message : "unknown")
    return { error: "Une erreur est survenue." }
  }
}

export async function submitCampaignResponse(
  campaignId: string,
  data: unknown
): Promise<{ success?: boolean; error?: string }> {
  try {
    const session = await getSession()
    if (!session) return { error: "Non authentifié." }
    const uid = session.uid

    const parsedId = firestoreId.safeParse(campaignId)
    if (!parsedId.success) return { error: "Identifiant de campagne invalide." }

    const parsed = submitResponseSchema.safeParse(data)
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Données invalides." }
    }
    const body = parsed.data

    // O(1) reverse-index lookup + ownership check. Without the ownership
    // guard any authenticated user could inject data into an arbitrary
    // campaign's responses subcollection.
    const index = await readCampaignIndex(parsedId.data)
    if (!index) return { error: "Campagne introuvable." }

    const campaignRef = adminDb
      .collection("managers").doc(index.managerUid)
      .collection("groups").doc(index.groupId)
      .collection("campaigns").doc(parsedId.data)
    const campDoc = await campaignRef.get()
    if (!campDoc.exists) return { error: "Campagne introuvable." }
    const campaignStatus = campDoc.data()!.status as string
    const managerUid = index.managerUid
    const groupId = index.groupId

    // Ownership check: the authenticated user must be an athlete in the
    // campaign's group. Return the same generic error as "campaign not found"
    // so we don't become an oracle for "is this campaign in an existing group".
    const athleteDoc = await adminDb
      .collection("managers").doc(managerUid)
      .collection("groups").doc(groupId)
      .collection("athletes").doc(uid)
      .get()
    if (!athleteDoc.exists) return { error: "Campagne introuvable." }

    if (campaignStatus === "closed") return { error: "Cette campagne est clôturée." }

    const encryptedHome = encryptAddress(body.homeAddress)
    const encryptedSchool = body.schoolAddress ? encryptAddress(body.schoolAddress) : ""

    await campaignRef.collection("responses").doc(uid).set({
      athleteId: uid,
      schedule: body.schedule,
      homeAddress: encryptedHome,
      schoolAddress: encryptedSchool,
      constraints: body.constraints,
      submittedAt: new Date(),
    })

    return { success: true }
  } catch (error) {
    console.error("[CAMPAIGN] submitCampaignResponse failed:", error instanceof Error ? error.message : "unknown")
    return { error: "Une erreur est survenue lors de l'envoi." }
  }
}

export async function deleteAthleteData(
  campaignId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const session = await getSession()
    if (!session) return { error: "Non authentifié." }

    const uid = session.uid
    const email = session.email || ""

    const parsedId = firestoreId.safeParse(campaignId)
    if (!parsedId.success) return { error: "Identifiant de campagne invalide." }

    // O(1) reverse-index lookup + ownership check. Without the ownership
    // guard a logged-in user could trigger GDPR delete side-effects (Firebase
    // Auth removal, profile removal) by guessing any valid campaignId.
    const index = await readCampaignIndex(parsedId.data)
    if (!index) return { error: "Campagne introuvable." }

    const groupRef = adminDb
      .collection("managers").doc(index.managerUid)
      .collection("groups").doc(index.groupId)
    const athleteDoc = await groupRef.collection("athletes").doc(uid).get()
    if (!athleteDoc.exists) return { error: "Campagne introuvable." }

    const managerUid = index.managerUid
    const groupId = index.groupId
    const campaignRef = groupRef.collection("campaigns").doc(parsedId.data)
    const athleteFirstName = (athleteDoc.data()!.firstName as string | undefined) || ""

    // 1. Delete the athlete's response in the campaign (if any)
    await campaignRef.collection("responses").doc(uid).delete().catch(() => {})

    // 2. Delete the athlete's encrypted profile
    await adminDb.collection("athletes").doc(uid).delete().catch(() => {})

    // 3. Delete the athlete's record in the group
    await adminDb
      .collection("managers").doc(managerUid)
      .collection("groups").doc(groupId)
      .collection("athletes").doc(uid)
      .delete()
      .catch(() => {})

    // 4. Delete the Firebase Auth account
    await adminAuth.deleteUser(uid).catch((authError) => {
      console.error("[GDPR] deleteUser failed:", authError instanceof Error ? authError.message : "unknown")
    })

    // 5. Send deletion confirmation email (best-effort)
    if (email) {
      await sendDeletionConfirmation(email, athleteFirstName || "Athlete")
    }

    return { success: true }
  } catch (error) {
    console.error("[GDPR] deleteAthleteData failed:", error instanceof Error ? error.message : "unknown")
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
