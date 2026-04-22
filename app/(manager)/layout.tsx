import { redirect } from "next/navigation"
import { requireManager } from "@/lib/firebase/auth"
import Link from "next/link"
import { Timer } from "lucide-react"
import { LogoutButton } from "@/components/custom/logout-button"

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const manager = await requireManager()
  if (!manager) redirect("/login")

  const managerName = manager.name

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl">
            <Timer className="h-6 w-6 text-blue-600" />
            Slot Training
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">Bonjour, {managerName}</span>
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
