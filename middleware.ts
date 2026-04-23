import { NextRequest, NextResponse } from "next/server"

const protectedRoutes = ["/dashboard"]
const protectedAthleteRoutes = ["/campaign"]
const authRoutes = ["/login", "/register", "/forgot-password"]

/**
 * UX-only redirect based on cookie PRESENCE — this middleware is NOT a security
 * boundary. The Next.js Edge runtime cannot load `firebase-admin`, so we cannot
 * verify the session cookie here. Real authentication/authorization is enforced
 * in server components and server actions via `getSession()` / `requireManager()`.
 *
 * Do not add additional security checks to this file — move them to the server
 * component or action that actually reads the data.
 */
export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("__session")?.value
  const { pathname } = request.nextUrl

  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
  }

  if (protectedAthleteRoutes.some((route) => pathname.startsWith(route))) {
    if (!sessionCookie) {
      const loginUrl = new URL("/athlete-login", request.url)
      loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search)
      return NextResponse.redirect(loginUrl)
    }
  }

  if (authRoutes.some((route) => pathname.startsWith(route))) {
    if (sessionCookie) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
