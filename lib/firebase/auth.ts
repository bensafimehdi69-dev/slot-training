import { cookies } from "next/headers"
import { adminAuth, adminDb } from "./admin"

const SESSION_COOKIE_NAME = "__session"
const SESSION_DURATION = 60 * 60 * 24 * 1000 // 24 hours

export async function createSessionCookie(idToken: string) {
  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_DURATION,
  })
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION / 1000,
    path: "/",
  })
}

export async function getSession() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!sessionCookie) return null
  try {
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true)
    return decodedClaims
  } catch {
    return null
  }
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

export interface ManagerSession {
  uid: string
  email: string | undefined
  name: string
}

/**
 * Returns the current session if (a) the cookie is valid and (b) the user has
 * a manager profile in Firestore. Returns null otherwise. Callers MUST handle
 * the null case (redirect for layouts, typed error for server actions).
 *
 * A single Firestore read per call — acceptable for now. Future optimization:
 * set a custom claim `role: "manager"` at registration and read it from the
 * decoded session cookie instead.
 */
export async function requireManager(): Promise<ManagerSession | null> {
  const session = await getSession()
  if (!session) return null
  const managerDoc = await adminDb.collection("managers").doc(session.uid).get()
  if (!managerDoc.exists) return null
  const data = managerDoc.data()
  return {
    uid: session.uid,
    email: session.email,
    name: typeof data?.name === "string" ? data.name : "Manager",
  }
}
