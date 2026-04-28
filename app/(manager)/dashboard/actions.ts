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
  sendCampaignReminderNotification,
  sendPlanningNotification,
  type PlanningSession,
} from "@/lib/utils/email"
import {
  writeInviteIndex,
  deleteInviteIndex,
  writeCampaignIndex,
  deleteCampaignIndex,
  deleteIndexesForGroup,
} from "@/lib/server/indexes"
import { sendPushToUsers } from "@/lib/server/push"
import { saveAvatar } from "@/lib/server/avatar-storage"
import { defaultLocale, locales, type Locale } from "@/lib/i18n/config"

/**
 * Look up the athletes' preferredLanguage stored on their global profile
 * (athletes/{uid}.preferredLanguage, written by the language picker). Falls
 * back to the app default. We resolve this once per email fan-out so each
 * recipient gets the template in their own language without N extra reads.
 */
async function fetchAthleteLocales(uids: string[]): Promise<Map<string, Locale>> {
  const map = new Map<string, Locale>()
  if (uids.length === 0) return map
  const docs = await adminDb.getAll(
    ...uids.map((uid) => adminDb.collection("athletes").doc(uid))
  )
  for (const doc of docs) {
    const data = doc.data()
    const candidate = data?.preferredLanguage as string | undefined
    const locale =
      candidate && (locales as readonly string[]).includes(candidate)
        ? (candidate as Locale)
        : defaultLocale
    map.set(doc.id, locale)
  }
  return map
}
import { revalidatePath } from "next/cache"
import type { Group, GroupAthlete } from "@/lib/types/group"
import type { Campaign, CampaignResponder, ManagerCampaign } from "@/lib/types/campaign"

// Firestore doc IDs are strings of ≤1500 bytes with a limited charset. We
// intentionally keep this permissive but bounded — just enough to reject
// empty strings, absurdly long input, and path-traversal attempts.
const firestoreId = z.string().min(1).max(128).regex(/^[^/]+$/, "Identifiant invalide.")

/**
 * Build the absolute athlete-facing URL for an email body. The athlete will
 * be redirected to /athlete-login by the proxy if not already signed in,
 * and bounced back to `finalPath` after entering their password.
 */
function buildAthleteLink(finalPath: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return `${appUrl}${finalPath}`
}

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

// Targeted athlete IDs for a campaign. Capped to a sane maximum so a malformed
// payload can't blow up the email fan-out. Each entry must look like a Firestore
// doc id (no slashes, ≤128 chars).
const targetAthleteIdsSchema = z.array(firestoreId).max(1000)

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
    targetAthleteIds: targetAthleteIdsSchema.optional(),
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

/**
 * Upload + persist a group avatar. The file is uploaded via the Admin SDK
 * (server-side), URL stored on the group doc. Throws on missing/invalid
 * file so the client can surface a useful toast.
 */
export async function setGroupAvatar(
  groupId: string,
  formData: FormData
): Promise<{ avatarUrl?: string; error?: string }> {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const parsedId = firestoreId.safeParse(groupId)
  if (!parsedId.success) return { error: "Identifiant de groupe invalide." }

  const file = formData.get("file")
  if (!(file instanceof File)) return { error: "Fichier manquant." }

  const groupRef = adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedId.data)
  const groupSnap = await groupRef.get()
  if (!groupSnap.exists) return { error: "Groupe introuvable." }

  try {
    const avatarUrl = await saveAvatar("groups", parsedId.data, file)
    await groupRef.update({ avatarUrl })
    revalidatePath("/dashboard")
    return { avatarUrl }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Upload échoué.",
    }
  }
}

/**
 * Upload + persist the manager's own avatar. Stored on the manager doc
 * (managers/{uid}.avatarUrl).
 */
export async function setManagerAvatar(
  formData: FormData
): Promise<{ avatarUrl?: string; error?: string }> {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const file = formData.get("file")
  if (!(file instanceof File)) return { error: "Fichier manquant." }

  try {
    const avatarUrl = await saveAvatar("managers", manager.uid, file)
    await adminDb.collection("managers").doc(manager.uid).update({ avatarUrl })
    revalidatePath("/dashboard")
    return { avatarUrl }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Upload échoué.",
    }
  }
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

  // Avatars live on the global athlete doc (athletes/{uid}.avatarUrl) so a
  // single athlete's photo stays in sync across every group they joined.
  // One getAll per call is cheap; skipping it would force per-doc reads.
  const ids = snapshot.docs.map((d) => d.id)
  const avatars = new Map<string, string>()
  if (ids.length > 0) {
    const globalDocs = await adminDb.getAll(
      ...ids.map((id) => adminDb.collection("athletes").doc(id))
    )
    for (const doc of globalDocs) {
      const url = doc.data()?.avatarUrl
      if (typeof url === "string" && url.length > 0) avatars.set(doc.id, url)
    }
  }

  const athletes: GroupAthlete[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    avatarUrl: avatars.get(doc.id),
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

  const basePath = adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(groupId)

  // Fetch campaigns, athletes (for responder names), and every campaign's
  // responses in parallel. Previously CampaignCard fired its own
  // `getCampaignResponders` from useEffect, cascading N+1 round-trips after
  // the campaign list arrived. Inlining cuts the cold-render time roughly
  // in half on a group with several campaigns.
  const [snapshot, athletesSnapshot] = await Promise.all([
    basePath.collection("campaigns").orderBy("createdAt", "desc").get(),
    basePath.collection("athletes").get(),
  ])

  const athleteById = new Map(
    athletesSnapshot.docs.map((d) => [d.id, d.data()])
  )

  const responsesByCampaign = await Promise.all(
    snapshot.docs.map((doc) =>
      doc.ref.collection("responses").get().then(
        (s) => new Set(s.docs.map((d) => d.id))
      )
    )
  )

  // Explicit field picking — never spread doc.data(). Firestore Timestamps
  // are class instances and Next.js 16 rejects them when a server component
  // forwards an unconverted one to a client component. The \`optimizationStartedAt\`
  // timestamp used to leak through the spread and crash the dashboard.
  const campaigns: ManagerCampaign[] = snapshot.docs.map((doc, idx) => {
    const data = doc.data()
    const respondedIds = responsesByCampaign[idx]
    const targetIds = data.targetAthleteIds as string[] | undefined
    const targetSet = Array.isArray(targetIds) ? new Set(targetIds) : null

    const responders: CampaignResponder[] = athletesSnapshot.docs
      .filter((d) => (targetSet ? targetSet.has(d.id) : true))
      .map((d) => {
        const a = athleteById.get(d.id)!
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
            // Pass-through for the optimiser decision trace — the
            // OptimizationResultView shows it in a collapsible panel so
            // we can inspect the algo's behaviour on real campaigns.
            // Falls back to the legacy `debugMorning` field for results
            // produced before the trace was broadened past the morning.
            debug: Array.isArray(rawResult.debug)
              ? (rawResult.debug as string[])
              : Array.isArray(rawResult.debugMorning)
                ? (rawResult.debugMorning as string[])
                : undefined,
          } as Campaign["optimizationResult"])
        : null,
      planningStatus: data.planningStatus ?? "pending",
      planningStatusUpdatedAt: data.planningStatusUpdatedAt?.toDate() ?? null,
      targetAthleteIds: Array.isArray(data.targetAthleteIds)
        ? (data.targetAthleteIds as string[])
        : undefined,
      responders,
    } as ManagerCampaign
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

  // targetAthleteIds is sent as a JSON array of athlete UIDs. If the field is
  // missing, the campaign targets every athlete currently in the group (legacy
  // behaviour).
  let targetAthleteIdsRaw: unknown = undefined
  const targetAthleteIdsField = formData.get("targetAthleteIds")
  if (typeof targetAthleteIdsField === "string" && targetAthleteIdsField.length > 0) {
    try {
      targetAthleteIdsRaw = JSON.parse(targetAthleteIdsField)
    } catch {
      return { error: "Liste d'athlètes invalide." }
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
    targetAthleteIds: targetAthleteIdsRaw,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides." }
  }
  const input = parsed.data

  // Intersect the requested target list with athletes currently in the group.
  // Anything else (stale UID, manual tampering) is dropped silently — we never
  // send a campaign to someone who isn't a member of the group.
  const athletesSnapshot = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedId.data)
    .collection("athletes")
    .get()

  const allAthleteIds = new Set(athletesSnapshot.docs.map((doc) => doc.id))
  let targetAthleteIds: string[] | undefined
  if (input.targetAthleteIds) {
    targetAthleteIds = input.targetAthleteIds.filter((id) => allAthleteIds.has(id))
    if (targetAthleteIds.length === 0) {
      return { error: "Aucun athlète sélectionné." }
    }
  }

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
      ...(targetAthleteIds ? { targetAthleteIds } : {}),
    })

  // Reverse index so athlete-facing lookups can resolve campaignId → path
  // in one read instead of scanning every manager.
  await writeCampaignIndex(campaignRef.id, {
    managerUid: manager.uid,
    groupId: parsedId.data,
  })

  // Send emails only to targeted athletes. Awaited in parallel so the
  // serverless function doesn't terminate before the Resend calls resolve —
  // fire-and-forget would drop messages silently.
  const targetSet = targetAthleteIds ? new Set(targetAthleteIds) : null
  const targetedDocs = athletesSnapshot.docs.filter((doc) =>
    targetSet ? targetSet.has(doc.id) : true
  )

  // Resolve each athlete's preferred language so the email body lands in
  // their language. One getAll batch — no per-recipient round-trips.
  const localesByAthlete = await fetchAthleteLocales(targetedDocs.map((d) => d.id))

  await Promise.allSettled(
    targetedDocs.map(async (athleteDoc) => {
      const athlete = athleteDoc.data()
      if (!athlete.email) return
      const responseLink = buildAthleteLink(`/campaign/${campaignRef.id}`)
      return sendCampaignNotification(
        athlete.email,
        athlete.firstName || "Athlete",
        localesByAthlete.get(athleteDoc.id),
        {
          trainingLocation: input.trainingLocationFormatted,
          startDate: input.startDate,
          endDate: input.endDate,
          deadline: input.deadline,
          responseLink,
        }
      )
    })
  )

  // Push notification fan-out, in parallel with the email path. Athletes
  // who haven't opted in have no tokens, so sendPushToUser is a silent no-op
  // for them — no extra cost.
  await sendPushToUsers(
    targetedDocs.map((d) => d.id),
    "athlete",
    {
      title: "Nouvelle campagne d'entraînement",
      body: `${input.startDate} → ${input.endDate} · ${input.trainingLocationFormatted}`,
      url: `/campaign/${campaignRef.id}`,
    }
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

  // Notify only the targeted athletes — even those who haven't responded yet —
  // so they can adjust before the new deadline. Legacy campaigns (no
  // targetAthleteIds) fall back to the whole group.
  const athletesSnapshot = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedGroupId.data)
    .collection("athletes")
    .get()

  const existingTargets = snap.data()?.targetAthleteIds as string[] | undefined
  const targetSet = Array.isArray(existingTargets) ? new Set(existingTargets) : null
  const targetedDocsForUpdate = athletesSnapshot.docs.filter((doc) =>
    targetSet ? targetSet.has(doc.id) : true
  )
  const localesForUpdate = await fetchAthleteLocales(
    targetedDocsForUpdate.map((d) => d.id)
  )

  await Promise.allSettled(
    targetedDocsForUpdate.map(async (athleteDoc) => {
      const athlete = athleteDoc.data()
      if (!athlete.email) return
      const responseLink = buildAthleteLink(`/campaign/${parsedCampaignId.data}`)
      return sendCampaignUpdatedNotification(
        athlete.email,
        athlete.firstName || "Athlete",
        localesForUpdate.get(athleteDoc.id),
        {
          trainingLocation: input.trainingLocationFormatted,
          startDate: input.startDate,
          endDate: input.endDate,
          deadline: input.deadline,
          responseLink,
        }
      )
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
  // emails from the group's athletes subcollection. Only targeted athletes get
  // notified; legacy campaigns (no targetAthleteIds) fall back to the whole
  // group.
  const athletesSnapshot = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups").doc(parsedGroupId.data)
    .collection("athletes")
    .get()

  const existingTargets = data.targetAthleteIds as string[] | undefined
  const targetSet = Array.isArray(existingTargets) ? new Set(existingTargets) : null
  const targetedDocsForDelete = athletesSnapshot.docs.filter((doc) =>
    targetSet ? targetSet.has(doc.id) : true
  )
  const localesForDelete = await fetchAthleteLocales(
    targetedDocsForDelete.map((d) => d.id)
  )

  await Promise.allSettled(
    targetedDocsForDelete.map((athleteDoc) => {
      const athlete = athleteDoc.data()
      if (!athlete.email) return Promise.resolve()
      return sendCampaignDeletedNotification(
        athlete.email,
        athlete.firstName || "Athlete",
        localesForDelete.get(athleteDoc.id),
        {
          startDate: data.startDate,
          endDate: data.endDate,
        }
      )
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

  if (optimResult) {
    const athletesSnapshot = await basePath.collection("athletes").get()

    // Group sessions by athlete so each athlete receives a SINGLE email
    // listing every session they've been assigned this week — collective
    // end-of-day, morning collective, morning individuals, etc.
    const sessionsByAthlete = new Map<string, PlanningSession[]>()

    type RawSession = {
      type: "collective" | "individual"
      startTime: string
      endTime: string
      athletes: Array<{
        athleteId: string
        departureTime?: string
        travelMinutes?: number
        walkingMinutes?: number
        drivingMinutes?: number
        departureAddress?: string
      }>
    }
    type RawDayPlanning = {
      day: string
      endOfDaySession: RawSession | null
      morningSessions: RawSession[]
    }

    const dailyPlannings = (optimResult.dailyPlannings ?? []) as RawDayPlanning[]
    if (dailyPlannings.length > 0) {
      for (const planning of dailyPlannings) {
        const all: RawSession[] = [
          ...(planning.endOfDaySession ? [planning.endOfDaySession] : []),
          ...planning.morningSessions,
        ]
        for (const session of all) {
          for (const a of session.athletes) {
            const list = sessionsByAthlete.get(a.athleteId) ?? []
            list.push({
              type: session.type === "collective" ? "collectif" : "individuel",
              day: planning.day,
              startTime: session.startTime,
              endTime: session.endTime,
              departureTime: a.departureTime,
              travelMinutes: a.travelMinutes,
              walkingMinutes: a.walkingMinutes,
              drivingMinutes: a.drivingMinutes,
              departureAddress: a.departureAddress,
            })
            sessionsByAthlete.set(a.athleteId, list)
          }
        }
      }
    } else if (optimResult.bestSlot) {
      // Legacy fallback: campaigns optimised before Lot 3b only have the
      // bestSlot + individualSlots projection.
      type RawAthlete = {
        athleteId: string
        departureTime?: string
        travelMinutes?: number
        walkingMinutes?: number
        drivingMinutes?: number
        departureAddress?: string
      }
      type RawBestSlot = {
        day: string
        startTime: string
        endTime: string
        availableAthletes: RawAthlete[]
      }
      const bestSlot = optimResult.bestSlot as RawBestSlot
      for (const a of bestSlot.availableAthletes) {
        const list = sessionsByAthlete.get(a.athleteId) ?? []
        list.push({
          type: "collectif",
          day: bestSlot.day,
          startTime: bestSlot.startTime,
          endTime: bestSlot.endTime,
          departureTime: a.departureTime,
          travelMinutes: a.travelMinutes,
          walkingMinutes: a.walkingMinutes,
          drivingMinutes: a.drivingMinutes,
          departureAddress: a.departureAddress,
        })
        sessionsByAthlete.set(a.athleteId, list)
      }
      type RawIndividual = {
        athleteId: string
        day: string
        startTime: string
        endTime: string
        departureTime?: string
        travelMinutes?: number
        walkingMinutes?: number
        drivingMinutes?: number
        departureAddress?: string
      }
      for (const indiv of (optimResult.individualSlots ?? []) as RawIndividual[]) {
        const list = sessionsByAthlete.get(indiv.athleteId) ?? []
        list.push({
          type: "individuel",
          day: indiv.day,
          startTime: indiv.startTime,
          endTime: indiv.endTime,
          departureTime: indiv.departureTime,
          travelMinutes: indiv.travelMinutes,
          walkingMinutes: indiv.walkingMinutes,
          drivingMinutes: indiv.drivingMinutes,
          departureAddress: indiv.departureAddress,
        })
        sessionsByAthlete.set(indiv.athleteId, list)
      }
    }

    const localesForPlanning = await fetchAthleteLocales(
      athletesSnapshot.docs.map((d) => d.id)
    )
    const tasks: Array<Promise<unknown>> = []
    const pushUids: string[] = []
    for (const athleteDoc of athletesSnapshot.docs) {
      const info = athleteDoc.data()
      if (!info.email) continue
      const sessions = sessionsByAthlete.get(athleteDoc.id) ?? []
      tasks.push(
        (async () => {
          const planningLink = buildAthleteLink(`/campaign/${campaignId}`)
          return sendPlanningNotification(
            info.email,
            info.firstName || "Athlete",
            localesForPlanning.get(athleteDoc.id),
            {
              sessions,
              trainingLocation: campaign.trainingLocation.formatted,
              planningLink,
            }
          )
        })()
      )
      // Only push to athletes who actually have at least one session — a
      // notification "Planning validé" with no sessions assigned would be
      // confusing.
      if (sessions.length > 0) pushUids.push(athleteDoc.id)
    }
    await Promise.allSettled(tasks)
    await sendPushToUsers(pushUids, "athlete", {
      title: "Votre planning est validé",
      body: "Vos séances pour la semaine sont disponibles dans l'app.",
      url: `/campaign/${campaignId}`,
    })
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

/**
 * List the targeted athletes for a campaign with their response status.
 *
 * If the campaign has explicit targetAthleteIds, the list is built from that
 * set (intersected with athletes still in the group). Otherwise — legacy
 * campaigns predating targeted sends — every current group athlete is
 * returned. Each entry carries hasResponded so the dashboard can show who has
 * filled in the campaign and who hasn't.
 */
export async function getCampaignResponders(groupId: string, campaignId: string) {
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

  const [campaignSnap, athletesSnapshot, responsesSnapshot] = await Promise.all([
    campaignRef.get(),
    basePath.collection("athletes").get(),
    campaignRef.collection("responses").get(),
  ])

  if (!campaignSnap.exists) return { error: "Campagne introuvable." }

  const targetIds = campaignSnap.data()?.targetAthleteIds as string[] | undefined
  const targetSet = Array.isArray(targetIds) ? new Set(targetIds) : null
  const respondedIds = new Set(responsesSnapshot.docs.map((doc) => doc.id))

  const responders: CampaignResponder[] = athletesSnapshot.docs
    .filter((doc) => (targetSet ? targetSet.has(doc.id) : true))
    .map((doc) => {
      const data = doc.data()
      return {
        athleteId: doc.id,
        firstName: (data.firstName as string) || "",
        lastName: (data.lastName as string) || "",
        hasResponded: respondedIds.has(doc.id),
      }
    })
    .sort((a, b) => {
      const an = `${a.lastName} ${a.firstName}`.trim().toLowerCase()
      const bn = `${b.lastName} ${b.firstName}`.trim().toLowerCase()
      return an.localeCompare(bn)
    })

  return { data: responders }
}

// Window during which the deadline reminder is sent (and lower bound — past
// this point we wait for auto-finalize instead). 48h before the deadline,
// every non-responder gets a single nudge by email.
const REMINDER_WINDOW_HOURS = 48
// Idempotence guard: don't re-send a reminder for the same campaign within
// this many hours. A manager hitting refresh shouldn't spam athletes.
const REMINDER_COOLDOWN_HOURS = 20

/**
 * Background tasks the manager would otherwise have to remember to run:
 * (1) Auto-finalize campaigns whose deadline has passed (status active →
 *     closed), so the dashboard can move on to the optimisation step.
 * (2) Send a reminder email to non-responders when the deadline is within
 *     the next 48h, idempotent via lastReminderSentAt on the campaign.
 *
 * Called from the dashboard mount — "lazy cron" — so we don't depend on a
 * separate scheduled function service. Cheap when there's nothing to do
 * (one read per campaign, no writes).
 */
export async function runScheduledCampaignTasks() {
  const manager = await requireManager()
  if (!manager) return { error: "Non autorisé." }

  const groupsSnap = await adminDb
    .collection("managers").doc(manager.uid)
    .collection("groups")
    .get()

  let closedCount = 0
  let remindersSentCount = 0
  const now = Date.now()
  const reminderWindowMs = REMINDER_WINDOW_HOURS * 60 * 60 * 1000
  const reminderCooldownMs = REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000

  // Process each group in parallel. Inside a group, campaigns are also
  // processed in parallel — the work for each is independent.
  await Promise.allSettled(
    groupsSnap.docs.map(async (groupDoc) => {
      const groupId = groupDoc.id
      const basePath = adminDb
        .collection("managers").doc(manager.uid)
        .collection("groups").doc(groupId)

      const [campaignsSnap, athletesSnap] = await Promise.all([
        basePath.collection("campaigns").where("status", "==", "active").get(),
        basePath.collection("athletes").get(),
      ])

      const athleteById = new Map(
        athletesSnap.docs.map((d) => [d.id, d.data()])
      )

      await Promise.allSettled(
        campaignsSnap.docs.map(async (campDoc) => {
          const data = campDoc.data()
          const deadlineMs =
            (data.deadline as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0
          if (!deadlineMs) return

          // (1) Past deadline → close.
          if (deadlineMs <= now) {
            await campDoc.ref.update({ status: "closed" })
            closedCount += 1
            return
          }

          // (2) Within the reminder window → nudge non-responders.
          const msUntilDeadline = deadlineMs - now
          if (msUntilDeadline > reminderWindowMs) return

          const lastReminderMs =
            (data.lastReminderSentAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0
          if (now - lastReminderMs < reminderCooldownMs) return

          const targetIds = data.targetAthleteIds as string[] | undefined
          const targetSet = Array.isArray(targetIds) ? new Set(targetIds) : null
          const responsesSnap = await campDoc.ref.collection("responses").get()
          const respondedIds = new Set(responsesSnap.docs.map((d) => d.id))

          const recipients = athletesSnap.docs.filter((d) => {
            if (targetSet && !targetSet.has(d.id)) return false
            if (respondedIds.has(d.id)) return false
            const a = athleteById.get(d.id)
            return Boolean(a?.email)
          })
          if (recipients.length === 0) return

          const hoursRemaining = Math.max(1, Math.round(msUntilDeadline / (60 * 60 * 1000)))
          const trainingLocation = (data.trainingLocation?.formatted as string) || ""
          const startDate = (data.startDate as string) || ""
          const endDate = (data.endDate as string) || ""
          // Resolve recipient locales once. Each athlete gets their reminder
          // in their preferred language; deadline label is formatted per
          // locale (Intl.DateTimeFormat handles fr/en/ar correctly).
          const localesForReminder = await fetchAthleteLocales(
            recipients.map((d) => d.id)
          )

          await Promise.allSettled(
            recipients.map((d) => {
              const a = athleteById.get(d.id)!
              const recipientLocale = localesForReminder.get(d.id) ?? defaultLocale
              const deadlineLabel = new Date(deadlineMs).toLocaleString(
                recipientLocale,
                { dateStyle: "long", timeStyle: "short" }
              )
              return sendCampaignReminderNotification(
                a.email as string,
                (a.firstName as string) || "Athlete",
                recipientLocale,
                {
                  trainingLocation,
                  startDate,
                  endDate,
                  deadline: deadlineLabel,
                  hoursRemaining,
                  responseLink: buildAthleteLink(`/campaign/${campDoc.id}`),
                }
              )
            })
          )

          await sendPushToUsers(
            recipients.map((d) => d.id),
            "athlete",
            {
              title: `Rappel : campagne à compléter (${hoursRemaining}h)`,
              body: `Période ${startDate} → ${endDate}. Répondez avant la deadline.`,
              url: `/campaign/${campDoc.id}`,
            }
          )

          await campDoc.ref.update({ lastReminderSentAt: new Date() })
          remindersSentCount += recipients.length
        })
      )
    })
  )

  if (closedCount > 0 || remindersSentCount > 0) {
    revalidatePath("/dashboard")
  }
  return { data: { closedCount, remindersSentCount } }
}
