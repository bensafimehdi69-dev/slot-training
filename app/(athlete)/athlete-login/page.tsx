"use client"

import { useState } from "react"
import { signInWithEmailAndPassword } from "firebase/auth"
import { auth } from "@/lib/firebase/client"
import { createAthleteSession } from "./actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Timer } from "lucide-react"
import { toast } from "sonner"

// Same-origin relative path only: starts with `/`, is not `//...` or `/\...`
// (would be interpreted as protocol-relative and could redirect off-site).
function isSafeRedirect(value: string | null): value is string {
  if (!value) return false
  if (!value.startsWith("/")) return false
  if (value.startsWith("//") || value.startsWith("/\\")) return false
  return true
}

export default function AthleteLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  // Read ?redirect=... once, lazily on first client render. Keeps the page
  // statically prerenderable (useSearchParams would force a Suspense wrapper).
  const [redirectUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    const params = new URLSearchParams(window.location.search)
    const raw = params.get("redirect")
    return isSafeRedirect(raw) ? raw : null
  })

  async function handleLogin() {
    if (!email || !password) {
      toast.error("Veuillez saisir votre email et votre mot de passe.")
      return
    }

    setLoading(true)
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const idToken = await credential.user.getIdToken()
      const result = await createAthleteSession(idToken)
      if (result.error) {
        toast.error(result.error)
        setLoading(false)
        return
      }
      window.location.href = redirectUrl ?? "/home"
    } catch (error: unknown) {
      const code = (error as { code?: string }).code
      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found"
      ) {
        toast.error("Email ou mot de passe incorrect.")
      } else if (code === "auth/invalid-email") {
        toast.error("Adresse email invalide.")
      } else if (code === "auth/too-many-requests") {
        toast.error("Trop de tentatives. Réessayez plus tard.")
      } else {
        toast.error("Connexion impossible. Veuillez réessayer.")
      }
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Timer className="h-10 w-10 text-blue-600" />
          </div>
          <CardTitle>Espace athlète</CardTitle>
          <CardDescription>
            Connectez-vous pour accéder à vos campagnes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin()
                }}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleLogin}
              disabled={loading || !email || !password}
            >
              {loading ? "Connexion en cours..." : "Se connecter"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Pas encore de compte ? Demandez un lien d&apos;invitation à votre
              entraîneur.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
