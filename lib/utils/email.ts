import { Resend } from "resend"

const FROM_EMAIL = "Slot Training <onboarding@resend.dev>"

// Lazy singleton. Resend's constructor throws synchronously if the key is
// missing, so instantiating at module scope breaks `next build`'s page-data
// collection step in any environment where the env var isn't loaded (CI,
// fresh clones, worktrees). Keep the handle behind a function and fail only
// when we actually try to send.
let resendClient: Resend | null = null
function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error("RESEND_API_KEY is not set")
    resendClient = new Resend(key)
  }
  return resendClient
}

// Resend's free tier only delivers to the account owner, so in dev we
// also print the email to the terminal. A verified custom domain on
// Resend lifts this restriction in prod.
function logEmailInDev(to: string, subject: string, extras?: Record<string, string>) {
  if (process.env.NODE_ENV === "production") return
  console.log(`\n📧 [DEV] Email to ${to}`)
  console.log(`  Subject: ${subject}`)
  if (extras) {
    for (const [k, v] of Object.entries(extras)) console.log(`  ${k}: ${v}`)
  }
  console.log("")
}

/**
 * Minimal HTML escape for user-supplied strings interpolated into email
 * templates. Prevents tag injection (e.g. a malicious trainingLocation name
 * containing `<img onerror=...>` or an athlete firstName with `<a href>`).
 * URLs that come from our own code (e.g. responseLink) are not escaped — they
 * must already be safe strings.
 */
function esc(value: string | undefined | null): string {
  if (value === undefined || value === null) return ""
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function sendCampaignNotification(
  to: string,
  athleteFirstName: string,
  campaignData: {
    trainingLocation: string
    startDate: string
    endDate: string
    deadline: string
    responseLink: string
  }
) {
  const subject = `Nouvelle campagne d'entraînement - ${campaignData.startDate} au ${campaignData.endDate}`
  logEmailInDev(to, subject, { "Response link": campaignData.responseLink })
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <h2>Bonjour ${esc(athleteFirstName)},</h2>
        <p>Une nouvelle campagne d'entraînement a été créée :</p>
        <ul>
          <li><strong>Lieu :</strong> ${esc(campaignData.trainingLocation)}</li>
          <li><strong>Période :</strong> ${esc(campaignData.startDate)} au ${esc(campaignData.endDate)}</li>
          <li><strong>Date limite de réponse :</strong> ${esc(campaignData.deadline)}</li>
        </ul>
        <p><a href="${esc(campaignData.responseLink)}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Répondre à la campagne</a></p>
        <p>Merci de répondre avant la date limite.</p>
      `,
    })
  } catch (error) {
    // Log only the error message, never the full object — it may contain
    // tokens, recipient PII, or Resend payloads we don't want in aggregated logs.
    console.error("[EMAIL] sendCampaignNotification failed:", error instanceof Error ? error.message : "unknown")
  }
}

export async function sendPlanningNotification(
  to: string,
  athleteFirstName: string,
  planningData: {
    slotType: "collectif" | "individuel" | "aucun"
    day?: string
    startTime?: string
    endTime?: string
    departureTime?: string
    travelEstimate?: string
    trainingLocation: string
    reason?: string
    planningLink: string
  }
) {
  try {
    let content = ""
    if (planningData.slotType === "collectif" || planningData.slotType === "individuel") {
      content = `
        <p>Votre créneau (${esc(planningData.slotType)}) :</p>
        <ul>
          <li><strong>Jour :</strong> ${esc(planningData.day)}</li>
          <li><strong>Horaire :</strong> ${esc(planningData.startTime)} - ${esc(planningData.endTime)}</li>
          ${planningData.departureTime ? `<li><strong>Heure de départ :</strong> ${esc(planningData.departureTime)}</li>` : ""}
          ${planningData.travelEstimate ? `<li><strong>Trajet estimé :</strong> ${esc(planningData.travelEstimate)}</li>` : ""}
          <li><strong>Lieu :</strong> ${esc(planningData.trainingLocation)}</li>
        </ul>
      `
    } else {
      content = `<p>Malheureusement, aucun créneau compatible n'a pu être trouvé.</p><p>Raison : ${esc(planningData.reason) || "Aucun créneau sans conflit de cours."}</p>`
    }

    const subject = "Votre planning d'entraînement est disponible"
    logEmailInDev(to, subject, {
      "Slot": planningData.slotType,
      "Day": planningData.day ?? "-",
      "Time": `${planningData.startTime ?? ""}-${planningData.endTime ?? ""}`,
      "Link": planningData.planningLink,
    })
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <h2>Bonjour ${esc(athleteFirstName)},</h2>
        <p>Le planning de votre période d'entraînement a été validé.</p>
        ${content}
        <p><a href="${esc(planningData.planningLink)}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Voir mon planning</a></p>
      `,
    })
  } catch (error) {
    console.error("[EMAIL] sendPlanningNotification failed:", error instanceof Error ? error.message : "unknown")
  }
}

export async function sendCampaignUpdatedNotification(
  to: string,
  athleteFirstName: string,
  campaignData: {
    trainingLocation: string
    startDate: string
    endDate: string
    deadline: string
    responseLink: string
  }
) {
  const subject = `Mise à jour de la campagne - ${campaignData.startDate} au ${campaignData.endDate}`
  logEmailInDev(to, subject, { "Response link": campaignData.responseLink })
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <h2>Bonjour ${esc(athleteFirstName)},</h2>
        <p>Une campagne d'entraînement à laquelle vous participez a été modifiée. Merci de revérifier vos disponibilités :</p>
        <ul>
          <li><strong>Lieu :</strong> ${esc(campaignData.trainingLocation)}</li>
          <li><strong>Période :</strong> ${esc(campaignData.startDate)} au ${esc(campaignData.endDate)}</li>
          <li><strong>Date limite de réponse :</strong> ${esc(campaignData.deadline)}</li>
        </ul>
        <p><a href="${esc(campaignData.responseLink)}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Mettre à jour ma réponse</a></p>
      `,
    })
  } catch (error) {
    console.error("[EMAIL] sendCampaignUpdatedNotification failed:", error instanceof Error ? error.message : "unknown")
  }
}

export async function sendCampaignDeletedNotification(
  to: string,
  athleteFirstName: string,
  campaignData: {
    startDate: string
    endDate: string
  }
) {
  const subject = `Annulation de campagne - ${campaignData.startDate} au ${campaignData.endDate}`
  logEmailInDev(to, subject, {
    "Period": `${campaignData.startDate} au ${campaignData.endDate}`,
  })
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <h2>Bonjour ${esc(athleteFirstName)},</h2>
        <p>La campagne d'entraînement prévue du <strong>${esc(campaignData.startDate)}</strong> au <strong>${esc(campaignData.endDate)}</strong> a été <strong>annulée</strong> par votre entraîneur.</p>
        <p>Aucune action n'est requise de votre part. Vos données pour cette campagne ont été supprimées.</p>
      `,
    })
  } catch (error) {
    console.error("[EMAIL] sendCampaignDeletedNotification failed:", error instanceof Error ? error.message : "unknown")
  }
}

export async function sendDeletionConfirmation(to: string, firstName: string) {
  const subject = "Confirmation de suppression de vos données"
  logEmailInDev(to, subject, { "First name": firstName })
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <h2>Bonjour ${esc(firstName)},</h2>
        <p>Conformément à votre demande, toutes vos données personnelles ont été supprimées :</p>
        <ul>
          <li>Adresses (domicile, études, club)</li>
          <li>Emploi du temps</li>
          <li>Contraintes spécifiques</li>
          <li>Compte utilisateur</li>
        </ul>
        <p>Cette action est irréversible. Merci d'avoir utilisé Slot Training.</p>
      `,
    })
  } catch (error) {
    console.error("[EMAIL] sendDeletionConfirmation failed:", error instanceof Error ? error.message : "unknown")
  }
}
