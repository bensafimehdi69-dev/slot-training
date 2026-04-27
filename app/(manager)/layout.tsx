import { redirect } from "next/navigation"
import { getSession } from "@/lib/firebase/auth"
import { adminDb } from "@/lib/firebase/admin"
import Link from "next/link"
import { Timer } from "lucide-react"
import { LogoutButton } from "@/components/custom/logout-button"

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  // Distinguish "no session" (send to /login) from "session but not a manager"
  // (send to landing). Sending non-managers to /login would create a redirect
  // loop, because the middleware bounces authenticated users from /login back
  // to /dashboard.
  const session = await getSession()
  if (!session) redirect("/login")

  const managerDoc = await adminDb.collection("managers").doc(session.uid).get()
  // Non-manager with a session is almost always an athlete — send them to /home
  // instead of the landing. /home itself re-checks the profile and bounces to
  // /athlete-login if onboarding is incomplete.
  if (!managerDoc.exists) redirect("/home")

  const managerData = managerDoc.data()
  const managerName = typeof managerData?.name === "string" ? managerData.name : "Manager"

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl">
            <Timer className="h-6 w-6 text-blue-600" />
            Slot Training
          </Link>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <span className="max-w-[140px] truncate text-sm text-muted-foreground sm:max-w-none">
              Bonjour, {managerName}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
