"use server"

import { z } from "zod"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { getSession } from "@/lib/firebase/auth"
import { encryptAddress } from "@/lib/utils/encryption"
import { readAthleteProfile } from "@/lib/server/profile-service"
import { readCampaignIndex, addAthleteMembership } from "@/lib/server/indexes"
import { sendDeletionConfirmation } from "@/lib/utils/email"
import { addressSchema } from "@/lib/types/address"
import { dayKeys, migrateWeeklySchedule } from "@/lib/types/schedule"
import type { Campaign, CampaignResponse } from "@/lib/types/campaign"
import type { AthleteProfile } from "@/lib/types/profile"
import type { OptimizationResult, IndividualSlot } from "@/lib/types/planning"

// Firestore doc IDs are strings of ≤1500 bytes — bound aggressively and
// reject path-traversal attempts.
const firestoreId = z.string().min(1).max(128).regex(/^[^/]+$/, "Identifiant invalide.")

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horaire invalide.")

// WeeklySchedule keyed by dayKeys. Each day holds a list of busy slots, where
// each slot now carries an explicit \`location\` ("school" / "home") that the
// optimiser uses as the actual departure point for the next training trip
// instead of inferring it from the schedule shape (Lot 4). Reject unknown
// keys so a malicious client can't inflate the payload or inject extra data.
const scheduleSlotSchema = z.object({
  hour: hhmm,
  location: z.enum(["school", "home"]),
})
const weeklyScheduleSchema = z.object(
  Object.fromEntries(
    dayKeys.map((k) => [k, z.array(scheduleSlotSchema).max(24)])
  ) as Record<(typeof dayKeys)[number], z.ZodArray<typeof scheduleSlotSchema>>
)

const submitResponseSchema = z.object({
  schedule: weeklyScheduleSchema,
  homeAddress: addressSchema,
  schoolAddress: addressSchema.nullable(),
  constraints: z.string().max(2000),
})

export interface AthleteSession {
  type: "collectif" | "individuel"
  day: string
  // Raw weekday key (e.g. "lundi") so the client can localise the label
  // independently of the language used at optimisation time. Optional only
  // for legacy plannings that pre-date this field.
  dayKey?: string
  startTime: string
  endTime: string
  departureTime?: string
  travelMinutes?: number
  walkingMinutes?: number
  drivingMinutes?: number
  departureAddress?: string
}

interface CampaignForAthlete {
  campaign: Campaign
  response: CampaignResponse | null
  profile: AthleteProfile | null
  athleteFirstName: string
  athleteLastName: string
  athleteEmail: string
  managerUid: string
  groupId: string
  trainingLocation: string
  // All sessions assigned to this athlete across the week. Empty list means
  // no session was plannable. Populated only when the planning is validated.
  athleteSessions: AthleteSession[]
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

    // Self-heal: legacy athletes joined before the membership index existed
    // get backfilled the first time they open a campaign.
    addAthleteMembership(uid, managerUid, groupId).catch(() => {})

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
        // Migrate legacy responses that stored \`schedule\` as a plain string[]
        // of class hours into the new ScheduleSlot[] shape so the form can
        // render them with the school/home location.
        schedule: migrateWeeklySchedule(rData.schedule),
        homeAddress: rData.homeAddress,
        schoolAddress: rData.schoolAddress,
        constraints: rData.constraints || "",
        submittedAt: rData.submittedAt?.toDate() || new Date(),
      }
    }

    // Get athlete profile for pre-filling. uid comes from the verified
    // session above, so reading via the internal helper is safe.
    const profile = await readAthleteProfile(uid)

    // Collect every session assigned to this athlete across the week, but
    // only once the planning has been validated by the manager.
    let athleteSessions: AthleteSession[] = []
    if (campaignData.planningStatus === "validated" && campaignData.optimizationResult) {
      athleteSessions = findAthleteSessions(uid, campaignData.optimizationResult)
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
        trainingLocation: campaignData.trainingLocation.formatted,
        athleteSessions,
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

    // Did this submission complete the campaign? Push the manager once when
    // every targeted athlete has responded — better than spamming on every
    // single response. Counted off the responses subcollection size after
    // the write so we don't double-count if the athlete edits.
    try {
      const targetIds = campDoc.data()?.targetAthleteIds as string[] | undefined
      const targetSet = Array.isArray(targetIds) ? new Set(targetIds) : null
      const [responsesSnap, athletesSnap] = await Promise.all([
        campaignRef.collection("responses").get(),
        adminDb
          .collection("managers").doc(managerUid)
          .collection("groups").doc(groupId)
          .collection("athletes").get(),
      ])
      const groupAthleteIds = new Set(athletesSnap.docs.map((d) => d.id))
      const expected = targetSet
        ? Array.from(targetSet).filter((id) => groupAthleteIds.has(id))
        : Array.from(groupAthleteIds)
      const respondedTargeted = responsesSnap.docs.filter((d) =>
        expected.includes(d.id)
      ).length

      if (expected.length > 0 && respondedTargeted >= expected.length) {
        // Mark the campaign so we don't re-push if an athlete re-submits.
        const already = campDoc.data()?.allRespondedNotifiedAt as
          | FirebaseFirestore.Timestamp
          | undefined
        if (!already) {
          await campaignRef.update({ allRespondedNotifiedAt: new Date() })
          const { sendPushToUser } = await import("@/lib/server/push")
          await sendPushToUser(managerUid, "manager", {
            title: "Tous les athlètes ont répondu",
            body: "La campagne peut être finalisée et l'optimisation lancée.",
            url: "/dashboard",
          })
        }
      }
    } catch (error) {
      // Don't fail the response submit if the side-channel push errors out.
      console.error(
        "[CAMPAIGN] manager-completion push failed:",
        error instanceof Error ? error.message : "unknown"
      )
    }

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

// Walk the per-day plannings and collect every session that includes this
// athlete. Falls back to the legacy bestSlot + individualSlots projection if
// dailyPlannings is empty (campaigns optimised before Lot 3b).
function findAthleteSessions(
  athleteId: string,
  result: OptimizationResult
): AthleteSession[] {
  const out: AthleteSession[] = []

  const dailyPlannings = result.dailyPlannings ?? []
  if (dailyPlannings.length > 0) {
    for (const planning of dailyPlannings) {
      const candidates = [
        planning.endOfDaySession,
        ...planning.morningSessions,
      ]
      for (const session of candidates) {
        if (!session) continue
        const member = session.athletes.find((a) => a.athleteId === athleteId)
        if (!member) continue
        out.push({
          type: session.type === "collective" ? "collectif" : "individuel",
          day: planning.day,
          dayKey: planning.dayKey,
          startTime: session.startTime,
          endTime: session.endTime,
          departureTime: member.departureTime,
          travelMinutes: member.travelMinutes,
          walkingMinutes: member.walkingMinutes,
          drivingMinutes: member.drivingMinutes,
          departureAddress: member.departureAddress,
        })
      }
    }
    return dedupeSessions(out)
  }

  // Legacy fallback: collective bestSlot + the athlete's individual slot.
  const bestSlot = result.bestSlot
  if (bestSlot) {
    const inCollective = bestSlot.availableAthletes.find(
      (a) => a.athleteId === athleteId
    )
    if (inCollective) {
      out.push({
        type: "collectif",
        day: bestSlot.day,
        startTime: bestSlot.startTime,
        endTime: bestSlot.endTime,
        departureTime: inCollective.departureTime,
        travelMinutes: inCollective.travelMinutes,
        walkingMinutes: inCollective.walkingMinutes,
        drivingMinutes: inCollective.drivingMinutes,
        departureAddress: inCollective.departureAddress,
      })
    }
  }
  for (const slot of result.individualSlots ?? []) {
    if (slot.athleteId !== athleteId) continue
    out.push({
      type: "individuel",
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      departureTime: slot.departureTime,
      travelMinutes: slot.travelMinutes,
      walkingMinutes: slot.walkingMinutes,
      drivingMinutes: slot.drivingMinutes,
      departureAddress: slot.departureAddress,
    })
  }
  return dedupeSessions(out)
}

function dedupeSessions(sessions: AthleteSession[]): AthleteSession[] {
  const seen = new Set<string>()
  const out: AthleteSession[] = []
  for (const s of sessions) {
    const key = `${s.day}|${s.startTime}|${s.endTime}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

function deserializeOptimizationResult(data: Record<string, unknown>): OptimizationResult {
  const raw = data as Record<string, unknown>
  return {
    // Pre-Lot-3b campaigns optimised before this field existed; default to []
    // so the UI keeps working on legacy data.
    dailyPlannings: (raw.dailyPlannings || []) as OptimizationResult["dailyPlannings"],
    bestSlot: raw.bestSlot as OptimizationResult["bestSlot"],
    individualSlots: (raw.individualSlots || []) as OptimizationResult["individualSlots"],
    allSlots: (raw.allSlots || []) as OptimizationResult["allSlots"],
    calculatedAt: (raw.calculatedAt as { toDate?: () => Date })?.toDate?.() || new Date(),
  }
}
