import { Resend } from "resend"
import { getTranslations } from "next-intl/server"
import { defaultLocale, type Locale } from "@/lib/i18n/config"

// Verified domain on Resend (slot-training.mbapps.cloud — DKIM + SPF + DMARC
// records added on OVH). Override via RESEND_FROM_EMAIL if you ever need to
// switch domains without redeploying.
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ??
  "Slot Training <noreply@slot-training.mbapps.cloud>"

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

/**
 * Wraps the locale-resolution boilerplate. Returns a `t(key)` function
 * scoped to the email namespace + the dir attribute so RTL languages
 * (Arabic) get the right HTML directionality.
 */
async function loadTemplate(locale: Locale | undefined, sub: string) {
  const useLocale = locale ?? defaultLocale
  const t = await getTranslations({ locale: useLocale, namespace: `emails.${sub}` })
  const dir = useLocale === "ar" ? "rtl" : "ltr"
  return { t, dir }
}

const ctaButton = (href: string, label: string) =>
  `<a href="${esc(href)}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">${esc(label)}</a>`

export async function sendStaffInvitationNotification(
  to: string,
  inviterName: string,
  locale: Locale | undefined,
  data: { groupName: string; inviteLink: string; alreadyHasAccount: boolean }
) {
  const { t, dir } = await loadTemplate(locale, "staffInvitation")
  const subject = t("subject", { group: data.groupName })
  logEmailInDev(to, subject, { "Invite link": data.inviteLink })
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <div dir="${dir}">
          <h2>${esc(t("title"))}</h2>
          <p>${esc(t("intro", { inviter: inviterName, group: data.groupName }))}</p>
          <p>${esc(data.alreadyHasAccount ? t("loginCta") : t("createCta"))}</p>
          <p>${ctaButton(data.inviteLink, data.alreadyHasAccount ? t("loginButton") : t("createButton"))}</p>
          <p style="color:#6b7280;font-size:12px">${esc(t("expiry"))}</p>
          <p>${esc(t("footer"))}</p>
        </div>
      `,
    })
  } catch (error) {
    console.error(
      "[EMAIL] sendStaffInvitationNotification failed:",
      error instanceof Error ? error.message : "unknown"
    )
  }
}

export async function sendCampaignNotification(
  to: string,
  athleteFirstName: string,
  locale: Locale | undefined,
  campaignData: {
    trainingLocation: string
    startDate: string
    endDate: string
    deadline: string
    responseLink: string
  }
) {
  const { t, dir } = await loadTemplate(locale, "campaignCreated")
  const subject = t("subject", {
    start: campaignData.startDate,
    end: campaignData.endDate,
  })
  logEmailInDev(to, subject, { "Response link": campaignData.responseLink })
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <div dir="${dir}">
          <h2>${esc(t("greeting", { name: athleteFirstName }))}</h2>
          <p>${esc(t("intro"))}</p>
          <ul>
            <li><strong>${esc(t("location"))} :</strong> ${esc(campaignData.trainingLocation)}</li>
            <li><strong>${esc(t("period"))} :</strong> ${esc(campaignData.startDate)} → ${esc(campaignData.endDate)}</li>
            <li><strong>${esc(t("deadline"))} :</strong> ${esc(campaignData.deadline)}</li>
          </ul>
          <p>${ctaButton(campaignData.responseLink, t("cta"))}</p>
          <p>${esc(t("footer"))}</p>
        </div>
      `,
    })
  } catch (error) {
    console.error("[EMAIL] sendCampaignNotification failed:", error instanceof Error ? error.message : "unknown")
  }
}

/**
 * Sent automatically to athletes who haven't responded yet, when the deadline
 * is approaching (typically 24-48h before). Idempotent on the campaign side
 * via lastReminderSentAt — see runScheduledCampaignTasks.
 */
export async function sendCampaignReminderNotification(
  to: string,
  athleteFirstName: string,
  locale: Locale | undefined,
  reminderData: {
    trainingLocation: string
    startDate: string
    endDate: string
    deadline: string
    hoursRemaining: number
    responseLink: string
  }
) {
  const { t, dir } = await loadTemplate(locale, "campaignReminder")
  const subject = t("subject", { hours: reminderData.hoursRemaining })
  logEmailInDev(to, subject, { "Response link": reminderData.responseLink })
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <div dir="${dir}">
          <h2>${esc(athleteFirstName)},</h2>
          <p>${esc(t("intro", { hours: reminderData.hoursRemaining, deadline: reminderData.deadline }))}</p>
          <ul>
            <li><strong>${esc(reminderData.trainingLocation)}</strong></li>
            <li>${esc(reminderData.startDate)} → ${esc(reminderData.endDate)}</li>
          </ul>
          <p>${ctaButton(reminderData.responseLink, t("cta"))}</p>
          <p style="color:#64748b;font-size:13px">${esc(t("footer"))}</p>
        </div>
      `,
    })
  } catch (error) {
    console.error("[EMAIL] sendCampaignReminderNotification failed:", error instanceof Error ? error.message : "unknown")
  }
}

export interface PlanningSession {
  type: "collectif" | "individuel"
  day: string
  // Raw weekday key (e.g. "lundi") used to translate the day label in the
  // recipient's locale. Optional for legacy plannings without this field.
  dayKey?: string
  startTime: string
  endTime: string
  departureTime?: string
  travelMinutes?: number
  walkingMinutes?: number
  drivingMinutes?: number
  departureAddress?: string
}

export async function sendPlanningNotification(
  to: string,
  athleteFirstName: string,
  locale: Locale | undefined,
  planningData: {
    // Empty array = the athlete has no plannable session this week. The email
    // body falls back to a "no slot found" message in that case.
    sessions: PlanningSession[]
    trainingLocation: string
    planningLink: string
    // Optional reason explaining why no session could be planned, surfaced
    // when `sessions` is empty.
    reason?: string
  }
) {
  const { t, dir } = await loadTemplate(locale, "planningValidated")
  // Separate translator scoped to the "days" namespace so we can localise the
  // weekday label in the planning email body (it was previously baked in
  // French at optimisation time).
  const useLocale = locale ?? defaultLocale
  const tDays = await getTranslations({ locale: useLocale, namespace: "days" })
  try {
    let content: string
    if (planningData.sessions.length === 0) {
      const reason = planningData.reason || t("noSessionsDefault")
      content = `<p>${esc(t("noSessions"))}</p><p>${esc(t("noSessionsReason", { reason }))}</p>`
    } else {
      const sessionList = planningData.sessions
        .map((s) => {
          // Translated session-type label (collectif/individuel → matching
          // word in the recipient's language). The `type` field is stored as
          // the French token but we map it on the way out.
          const typeLabel =
            s.type === "collectif"
              ? t("sessionTypeCollective")
              : t("sessionTypeIndividual")

          // Show driving time only — walking estimates are unrealistic for
          // far destinations. Falls back to the legacy single-number for old
          // campaigns that predate the walking/driving split.
          let travel = ""
          if (s.drivingMinutes !== undefined) {
            travel = `<li>${esc(t("estimatedTravelDriving", { driving: s.drivingMinutes }))}</li>`
          } else if (s.travelMinutes !== undefined) {
            travel = `<li>${esc(t("estimatedTravel", { minutes: s.travelMinutes }))}</li>`
          }
          const departure = s.departureTime
            ? `<li><strong>${esc(t("departureTime"))} :</strong> ${esc(s.departureTime)}</li>`
            : ""
          const departureAddress = s.departureAddress
            ? `<li><strong>${esc(t("departureAddress"))} :</strong> ${esc(s.departureAddress)}</li>`
            : ""
          // Prefer the localised label derived from the raw key; fall back to
          // whatever the optimiser stored (currently the French label) for
          // legacy plannings that pre-date dayKey.
          const dayLabel = s.dayKey ? tDays(s.dayKey) : s.day
          return `
            <li style="margin-bottom:12px">
              <strong>${esc(dayLabel)} ${esc(s.startTime)} – ${esc(s.endTime)}</strong>
              ${esc(t("sessionType", { type: typeLabel }))}
              <ul>${departure}${travel}${departureAddress}</ul>
            </li>
          `
        })
        .join("")
      content = `
        <p>${esc(t("introWithSessions", { count: planningData.sessions.length }))}</p>
        <ul>${sessionList}</ul>
        <p><strong>${esc(t("trainingLocation"))} :</strong> ${esc(planningData.trainingLocation)}</p>
      `
    }

    const subject = t("subject")
    logEmailInDev(to, subject, {
      "Sessions": String(planningData.sessions.length),
      "Link": planningData.planningLink,
    })
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <div dir="${dir}">
          <h2>${esc(athleteFirstName)},</h2>
          ${content}
          <p>${ctaButton(planningData.planningLink, t("cta"))}</p>
        </div>
      `,
    })
  } catch (error) {
    console.error("[EMAIL] sendPlanningNotification failed:", error instanceof Error ? error.message : "unknown")
  }
}

export async function sendCampaignUpdatedNotification(
  to: string,
  athleteFirstName: string,
  locale: Locale | undefined,
  campaignData: {
    trainingLocation: string
    startDate: string
    endDate: string
    deadline: string
    responseLink: string
  }
) {
  const { t, dir } = await loadTemplate(locale, "campaignUpdated")
  // The "created" namespace owns the field labels (location/period/deadline)
  // — reuse them rather than duplicating in every template namespace.
  const tCreated = await getTranslations({
    locale: locale ?? defaultLocale,
    namespace: "emails.campaignCreated",
  })
  const subject = t("subject", {
    start: campaignData.startDate,
    end: campaignData.endDate,
  })
  logEmailInDev(to, subject, { "Response link": campaignData.responseLink })
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <div dir="${dir}">
          <h2>${esc(athleteFirstName)},</h2>
          <p>${esc(t("intro"))}</p>
          <ul>
            <li><strong>${esc(tCreated("location"))} :</strong> ${esc(campaignData.trainingLocation)}</li>
            <li><strong>${esc(tCreated("period"))} :</strong> ${esc(campaignData.startDate)} → ${esc(campaignData.endDate)}</li>
            <li><strong>${esc(tCreated("deadline"))} :</strong> ${esc(campaignData.deadline)}</li>
          </ul>
          <p>${ctaButton(campaignData.responseLink, t("cta"))}</p>
        </div>
      `,
    })
  } catch (error) {
    console.error("[EMAIL] sendCampaignUpdatedNotification failed:", error instanceof Error ? error.message : "unknown")
  }
}

export async function sendCampaignDeletedNotification(
  to: string,
  athleteFirstName: string,
  locale: Locale | undefined,
  campaignData: {
    startDate: string
    endDate: string
  }
) {
  const { t, dir } = await loadTemplate(locale, "campaignDeleted")
  const subject = t("subject", {
    start: campaignData.startDate,
    end: campaignData.endDate,
  })
  logEmailInDev(to, subject, {
    "Period": `${campaignData.startDate} → ${campaignData.endDate}`,
  })
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `
        <div dir="${dir}">
          <h2>${esc(athleteFirstName)},</h2>
          <p>${esc(t("intro"))}</p>
        </div>
      `,
    })
  } catch (error) {
    console.error("[EMAIL] sendCampaignDeletedNotification failed:", error instanceof Error ? error.message : "unknown")
  }
}

export async function sendDeletionConfirmation(to: string, firstName: string, locale?: Locale) {
  // Single-paragraph GDPR confirmation — translate inline rather than
  // creating a 6th nested namespace for one fixed message.
  const useLocale = locale ?? defaultLocale
  const dir = useLocale === "ar" ? "rtl" : "ltr"
  const subject =
    useLocale === "en"
      ? "Confirmation of your data deletion"
      : useLocale === "ar"
        ? "تأكيد حذف بياناتك"
        : "Confirmation de suppression de vos données"
  const body =
    useLocale === "en"
      ? "All your personal data has been deleted as requested. This action is irreversible."
      : useLocale === "ar"
        ? "تم حذف جميع بياناتك الشخصية بناءً على طلبك. هذا الإجراء لا يمكن التراجع عنه."
        : "Conformément à votre demande, toutes vos données personnelles ont été supprimées. Cette action est irréversible."
  logEmailInDev(to, subject, { "First name": firstName })
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: `<div dir="${dir}"><h2>${esc(firstName)},</h2><p>${esc(body)}</p></div>`,
    })
  } catch (error) {
    console.error("[EMAIL] sendDeletionConfirmation failed:", error instanceof Error ? error.message : "unknown")
  }
}
