import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { adminAuth } from "@/lib/firebase/admin"

const SESSION_COOKIE_NAME = "__session"
const SESSION_DURATION_MS = 60 * 60 * 24 * 1000 // 24h

const bodySchema = z.object({
  idToken: z.string().min(20).max(8192),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Jeton invalide." }, { status: 400 })
  }

  try {
    const sessionCookie = await adminAuth.createSessionCookie(parsed.data.idToken, {
      expiresIn: SESSION_DURATION_MS,
    })

    const response = NextResponse.json({ success: true })
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      // Matches the server-action path (lib/firebase/auth.ts::createSessionCookie)
      // so local http://localhost dev still receives the cookie.
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION_MS / 1000,
      path: "/",
    })
    return response
  } catch {
    return NextResponse.json({ error: "Jeton invalide ou expiré." }, { status: 401 })
  }
}
