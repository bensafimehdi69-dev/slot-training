"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Timer } from "lucide-react"

export function AppHeader() {
  return (
    <header className="border-b bg-white">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <Timer className="h-6 w-6 text-blue-600" />
          Slot Training
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login">
            <Button variant="ghost">Connexion</Button>
          </Link>
          <Link href="/register">
            <Button>Créer un compte</Button>
          </Link>
        </div>
      </div>
    </header>
  )
}
