"use client"

import { useState } from "react"
import { signInWithEmailAndPassword } from "firebase/auth"
import { auth } from "@/lib/firebase/client"
import { loginWithToken } from "../actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { toast } from "sonner"

export default function LoginPage() {
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const idToken = await credential.user.getIdToken()
      await loginWithToken(idToken)
    } catch {
      toast.error("Email ou mot de passe incorrect.")
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Connexion Manager</CardTitle>
        <CardDescription>Accédez à votre espace de gestion</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </Button>
          <div className="flex justify-between text-sm">
            <Link href="/forgot-password" className="text-blue-600 hover:underline">
              Mot de passe oublié ?
            </Link>
            <Link href="/register" className="text-blue-600 hover:underline">
              Créer un compte
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
