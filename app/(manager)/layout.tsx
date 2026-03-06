import { redirect } from "next/navigation"
import { getSession } from "@/lib/firebase/auth"
import { adminDb } from "@/lib/firebase/admin"
import Link from "next/link"
import { Timer, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { logout } from "@/app/(auth)/actions"

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect("/login")

  const managerDoc = await adminDb.collection("managers").doc(session.uid).get()
  const managerName = managerDoc.data()?.name || "Manager"

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl">
            <Timer className="h-6 w-6 text-blue-600" />
            Slot Training
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Bonjour, {managerName}</span>
            <form action={logout}>
              <Button variant="ghost" size="sm" type="submit">
                <LogOut className="h-4 w-4 mr-2" />
                Deconnexion
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
