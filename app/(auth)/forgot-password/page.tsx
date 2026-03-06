"use client"

import { useState } from "react"
import { sendPasswordResetEmail } from "firebase/auth"
import { auth } from "@/lib/firebase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { toast } from "sonner"

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string

    try {
      await sendPasswordResetEmail(auth, email)
      setSent(true)
      toast.success("Email de réinitialisation envoyé !")
    } catch {
      toast.error("Impossible d'envoyer l'email. Vérifiez l'adresse.")
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email envoyé</CardTitle>
          <CardDescription>Vérifiez votre boîte de réception pour réinitialiser votre mot de passe.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login">
            <Button variant="outline" className="w-full">Retour à la connexion</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Mot de passe oublié</CardTitle>
        <CardDescription>Entrez votre email pour recevoir un lien de réinitialisation</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Envoi..." : "Envoyer le lien"}
          </Button>
          <Link href="/login" className="block text-center text-sm text-blue-600 hover:underline">
            Retour à la connexion
          </Link>
        </form>
      </CardContent>
    </Card>
  )
}
