"use server"

import { z } from "zod"
import { adminAuth } from "@/lib/firebase/admin"
import { createSessionCookie } from "@/lib/firebase/auth"
import { checkRateLimit, formatRetryAfter, getClientIp } from "@/lib/server/rate-limit"

const emailSchema = z.string().trim().toLowerCase().email().max(254)
const idTokenSchema = z.string().min(20).max(8192)

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export async function sendAthleteMagicLink(email: unknown) {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { error: "Email invalide." }

  // Same double-bucket pattern as the join magic link — protects Resend
  // reputation and prevents email bombing.
  const ip = await getClientIp()
  const emailRl = await checkRateLimit({
    key: `athlete-magic:email:${parsed.data}`,
    max: 3,
    windowMs: 60 * 60 * 1000,
  })
  if (!emailRl.allowed) {
    return { error: `Trop d'envois pour cet email. Réessayez dans ${formatRetryAfter(emailRl.retryAfterMs)}.` }
  }
  const ipRl = await checkRateLimit({
    key: `athlete-magic:ip:${ip}`,
    max: 10,
    windowMs: 60 * 60 * 1000,
  })
  if (!ipRl.allowed) {
    return { error: `Trop de tentatives. Réessayez dans ${formatRetryAfter(ipRl.retryAfterMs)}.` }
  }

  const actionCodeSettings = {
    url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/athlete-login`,
    handleCodeInApp: true,
  }

  try {
    const link = await adminAuth.generateSignInWithEmailLink(parsed.data, actionCodeSettings)

    if (process.env.NODE_ENV !== "production") {
      // Resend's free tier only delivers to the verified account owner, so in
      // dev we also print the link to the terminal. Never log in prod — this
      // link grants sign-in to anyone who sees it.
      console.log(`\n🔑 [DEV] Athlete magic link for ${parsed.data}:\n${link}\n`)
    }

    const { Resend } = await import("resend")
    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: "Slot Training <noreply@slot-training.mbapps.cloud>",
      to: parsed.data,
      subject: "Connexion - Slot Training",
      html: `
        <h2>Connexion à Slot Training</h2>
        <p>Cliquez sur le bouton ci-dessous pour vous connecter :</p>
        <p><a href="${esc(link)}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Me connecter</a></p>
        <p>Ce lien est valable pendant 1 heure.</p>
      `,
    })

    return { success: true }
  } catch (error) {
    console.error("[ATHLETE LOGIN] sendAthleteMagicLink failed:", error instanceof Error ? error.message : "unknown")
    return { error: "Impossible d'envoyer l'email. Vérifiez votre adresse." }
  }
}

export async function createAthleteSession(idToken: unknown) {
  const parsed = idTokenSchema.safeParse(idToken)
  if (!parsed.success) return { error: "Jeton invalide." }
  try {
    await createSessionCookie(parsed.data)
    return { success: true }
  } catch (error) {
    console.error("[ATHLETE LOGIN] createAthleteSession failed:", error instanceof Error ? error.message : "unknown")
    return { error: "Erreur lors de la connexion." }
  }
}
