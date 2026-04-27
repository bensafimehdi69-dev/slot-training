"use server"

import { adminDb } from "@/lib/firebase/admin"
import { getSession } from "@/lib/firebase/auth"
import { readAthleteMemberships } from "@/lib/server/indexes"

export interface AthleteCampaignSummary {
  id: string
  groupId: string
  groupName: string
  startDate: string
  endDate: string
  trainingLocation: string
  status: "active" | "closed"
  planningStatus: "pending" | "validated" | "rejected"
  deadline: string // ISO
  hasResponded: boolean
  respondedAt: string | null // ISO
}

/**
 * List every campaign across every group the authenticated athlete belongs to.
 * Reads the \`athleteMemberships\` reverse index so we don't have to scan
 * every manager. Sorted by deadline desc (most recent first).
 */
export async function getAthleteCampaigns(): Promise<{
  campaigns?: AthleteCampaignSummary[]
  error?: string
}> {
  try {
    const session = await getSession()
    if (!session) return { error: "Non authentifié." }
    const uid = session.uid

    const memberships = await readAthleteMemberships(uid)
    if (memberships.length === 0) return { campaigns: [] }

    // Fan out: for every group, pull both the group's metadata and its
    // campaigns in parallel. \`Promise.all\` is fine here — we trust the
    // memberships list is small (a single athlete in tens of groups would
    // be unusual).
    const perGroup = await Promise.all(
      memberships.map(async ({ managerUid, groupId }) => {
        const groupRef = adminDb
          .collection("managers").doc(managerUid)
          .collection("groups").doc(groupId)

        const [groupSnap, campaignsSnap] = await Promise.all([
          groupRef.get(),
          groupRef.collection("campaigns").orderBy("createdAt", "desc").get(),
        ])
        if (!groupSnap.exists) return []
        const groupName = (groupSnap.data()?.name as string) || "Groupe"

        // For each campaign, also probe whether THIS athlete responded.
        const items = await Promise.all(
          campaignsSnap.docs.map(async (doc) => {
            const data = doc.data()
            const responseSnap = await doc.ref
              .collection("responses")
              .doc(uid)
              .get()
            const summary: AthleteCampaignSummary = {
              id: doc.id,
              groupId,
              groupName,
              startDate: data.startDate,
              endDate: data.endDate,
              trainingLocation: data.trainingLocation?.formatted ?? "",
              status: (data.status as "active" | "closed") ?? "active",
              planningStatus:
                (data.planningStatus as "pending" | "validated" | "rejected") ??
                "pending",
              deadline:
                (data.deadline?.toDate?.() ?? new Date()).toISOString(),
              hasResponded: responseSnap.exists,
              respondedAt:
                responseSnap.data()?.submittedAt?.toDate?.()?.toISOString() ??
                null,
            }
            return summary
          })
        )
        return items
      })
    )

    const campaigns = perGroup.flat()
    campaigns.sort((a, b) => b.deadline.localeCompare(a.deadline))
    return { campaigns }
  } catch (error) {
    console.error("[ATHLETE] getAthleteCampaigns failed:", error instanceof Error ? error.message : "unknown")
    return { error: "Une erreur est survenue." }
  }
}
