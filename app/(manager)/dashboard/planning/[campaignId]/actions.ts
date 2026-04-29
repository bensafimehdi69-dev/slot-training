"use server"

import { z } from "zod"
import { adminDb } from "@/lib/firebase/admin"
import { getSession } from "@/lib/firebase/auth"
import { readCampaignIndex } from "@/lib/server/indexes"
import { resolveGroupAccess } from "@/lib/server/group-access"
import type { Campaign, CampaignResponder } from "@/lib/types/campaign"

const firestoreId = z.string().min(1).max(128).regex(/^[^/]+$/, "Identifiant invalide.")

export interface PlanningPageData {
  campaign: Campaign
  responders: CampaignResponder[]
  groupName: string
  groupId: string
}

/**
 * Read-only fetch for the dedicated weekly-planning page. Resolves owner +
 * group via the campaign reverse index, then runs the same access check the
 * dashboard uses (owner OR viewer of the parent group). Returns the campaign
 * with its optimisation result and the full responder list.
 */
export async function getCampaignPlanning(
  campaignId: string
): Promise<{ data?: PlanningPageData; error?: string }> {
  const parsedId = firestoreId.safeParse(campaignId)
  if (!parsedId.success) return { error: "Identifiant de campagne invalide." }

  const session = await getSession()
  if (!session) return { error: "Non autorisé." }

  const index = await readCampaignIndex(parsedId.data)
  if (!index) return { error: "Campagne introuvable." }

  // Manager (or viewer) must have access to the parent group, otherwise an
  // attacker who guessed a campaignId could read someone else's planning.
  const access = await resolveGroupAccess(session.uid, index.groupId)
  if (!access || access.ownerUid !== index.managerUid) {
    return { error: "Non autorisé." }
  }

  const groupRef = adminDb
    .collection("managers").doc(access.ownerUid)
    .collection("groups").doc(index.groupId)
  const campaignRef = groupRef.collection("campaigns").doc(parsedId.data)

  const [groupDoc, campDoc, athletesSnap, responsesSnap] = await Promise.all([
    groupRef.get(),
    campaignRef.get(),
    groupRef.collection("athletes").get(),
    campaignRef.collection("responses").get(),
  ])

  if (!groupDoc.exists || !campDoc.exists) return { error: "Campagne introuvable." }

  const data = campDoc.data()!
  const respondedIds = new Set(responsesSnap.docs.map((d) => d.id))
  const targetIds = data.targetAthleteIds as string[] | undefined
  const targetSet = Array.isArray(targetIds) ? new Set(targetIds) : null

  const responders: CampaignResponder[] = athletesSnap.docs
    .filter((d) => (targetSet ? targetSet.has(d.id) : true))
    .map((d) => {
      const a = d.data()
      return {
        athleteId: d.id,
        firstName: (a.firstName as string) || "",
        lastName: (a.lastName as string) || "",
        hasResponded: respondedIds.has(d.id),
      }
    })
    .sort((a, b) => {
      const an = `${a.lastName} ${a.firstName}`.trim().toLowerCase()
      const bn = `${b.lastName} ${b.firstName}`.trim().toLowerCase()
      return an.localeCompare(bn)
    })

  let availableSlots: boolean[][] = Array(7)
    .fill(null)
    .map(() => Array(16).fill(true))
  if (typeof data.availableSlots === "string") {
    try {
      const parsed = JSON.parse(data.availableSlots)
      if (Array.isArray(parsed)) availableSlots = parsed as boolean[][]
    } catch {
      // Keep default-true.
    }
  }

  const rawResult = data.optimizationResult as Record<string, unknown> | null | undefined

  const campaign: Campaign = {
    id: campDoc.id,
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
          debug: Array.isArray(rawResult.debug)
            ? (rawResult.debug as string[])
            : undefined,
        } as Campaign["optimizationResult"])
      : null,
    planningStatus: (data.planningStatus as Campaign["planningStatus"]) ?? "pending",
    planningStatusUpdatedAt:
      (data.planningStatusUpdatedAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? null,
    targetAthleteIds: targetIds,
  }

  return {
    data: {
      campaign,
      responders,
      groupName: (groupDoc.data()?.name as string) ?? "",
      groupId: index.groupId,
    },
  }
}
