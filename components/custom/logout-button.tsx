"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

export function LogoutButton() {
  const tc = useTranslations("common")
  const router = useRouter()

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout}>
      <LogOut className="h-4 w-4 mr-2" />
      <span className="hidden sm:inline">{tc("logout")}</span>
    </Button>
  )
}
