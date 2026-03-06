import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = "Slot Training <noreply@slot-training.app>"

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
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Nouvelle campagne d'entraînement - ${campaignData.startDate} au ${campaignData.endDate}`,
      html: `
        <h2>Bonjour ${athleteFirstName},</h2>
        <p>Une nouvelle campagne d'entraînement a été créée :</p>
        <ul>
          <li><strong>Lieu :</strong> ${campaignData.trainingLocation}</li>
          <li><strong>Période :</strong> ${campaignData.startDate} au ${campaignData.endDate}</li>
          <li><strong>Date limite de réponse :</strong> ${campaignData.deadline}</li>
        </ul>
        <p><a href="${campaignData.responseLink}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Répondre à la campagne</a></p>
        <p>Merci de répondre avant la date limite.</p>
      `,
    })
  } catch (error) {
    console.error("[EMAIL] Failed to send campaign notification:", error)
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
        <p>Votre créneau (${planningData.slotType}) :</p>
        <ul>
          <li><strong>Jour :</strong> ${planningData.day}</li>
          <li><strong>Horaire :</strong> ${planningData.startTime} - ${planningData.endTime}</li>
          ${planningData.departureTime ? `<li><strong>Heure de départ :</strong> ${planningData.departureTime}</li>` : ""}
          ${planningData.travelEstimate ? `<li><strong>Trajet estimé :</strong> ${planningData.travelEstimate}</li>` : ""}
          <li><strong>Lieu :</strong> ${planningData.trainingLocation}</li>
        </ul>
      `
    } else {
      content = `<p>Malheureusement, aucun créneau compatible n'a pu être trouvé.</p><p>Raison : ${planningData.reason || "Aucun créneau sans conflit de cours."}</p>`
    }

    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Votre planning d'entraînement est disponible",
      html: `
        <h2>Bonjour ${athleteFirstName},</h2>
        <p>Le planning de votre période d'entraînement a été validé.</p>
        ${content}
        <p><a href="${planningData.planningLink}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Voir mon planning</a></p>
      `,
    })
  } catch (error) {
    console.error("[EMAIL] Failed to send planning notification:", error)
  }
}

export async function sendDeletionConfirmation(to: string, firstName: string) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Confirmation de suppression de vos données",
      html: `
        <h2>Bonjour ${firstName},</h2>
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
    console.error("[EMAIL] Failed to send deletion confirmation:", error)
  }
}
