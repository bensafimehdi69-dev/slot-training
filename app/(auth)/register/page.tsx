"use client"

import { useState } from "react"
import { signInWithEmailAndPassword } from "firebase/auth"
import { auth } from "@/lib/firebase/client"
import { registerManager } from "../actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { toast } from "sonner"

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await registerManager(formData)

    if (result.error) {
      toast.error(result.error)
      setLoading(false)
      return
    }

    const email = formData.get("email") as string
    const password = formData.get("password") as string
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const idToken = await credential.user.getIdToken()
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      })
      if (!res.ok) throw new Error("Session creation failed")
      window.location.href = "/dashboard"
    } catch {
      toast.error("Compte créé. Veuillez vous connecter.")
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Créer un compte Manager</CardTitle>
        <CardDescription>Commencez à organiser vos entraînements</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom complet</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" name="password" type="password" minLength={8} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Création..." : "Créer mon compte"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Déjà un compte ?{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Se connecter
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
