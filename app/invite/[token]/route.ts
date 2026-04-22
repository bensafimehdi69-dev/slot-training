import { NextRequest, NextResponse } from "next/server"
import { readInviteIndex } from "@/lib/server/indexes"

// Entry point for invitation links emailed to athletes. Resolves the token
// to its group via the reverse index and redirects to /join/[groupId].
// Previously scanned every manager (O(N managers × M groups)) and exposed
// invite-token existence as a timing oracle.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token || token.length < 8 || token.length > 128) {
    return new NextResponse("Lien d'invitation invalide.", { status: 404 })
  }

  const index = await readInviteIndex(token)
  if (!index) {
    return new NextResponse("Lien d'invitation invalide.", { status: 404 })
  }
  if (index.expiresAt < new Date()) {
    return new NextResponse("Ce lien d'invitation a expiré.", { status: 410 })
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
  const proto = request.headers.get("x-forwarded-proto") || "https"
  const origin = `${proto}://${host}`
  const url = new URL(`/join/${index.groupId}`, origin)
  url.searchParams.set("token", token)
  return NextResponse.redirect(url)
}
