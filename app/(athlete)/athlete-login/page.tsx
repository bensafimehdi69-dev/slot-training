"use client"

import { useState, useEffect } from "react"
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth"
import { auth } from "@/lib/firebase/client"
import { createAthleteSession, sendAthleteMagicLink } from "./actions"
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
import { Timer, Mail, Loader2 } from "lucide-react"
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
  const [loading, setLoading] = useState(false)
  const [linkSent, setLinkSent] = useState(false)
  const [verifying, setVerifying] = useState(false)

  // Read ?redirect=... once, lazily on first client render. Keeps the page
  // statically prerenderable (useSearchParams would force a Suspense wrapper)
  // and avoids the React 19 set-state-in-effect warning that comes from
  // reading in useEffect.
  const [redirectUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    const params = new URLSearchParams(window.location.search)
    const raw = params.get("redirect")
    return isSafeRedirect(raw) ? raw : null
  })

  // Check if arriving from a magic link
  useEffect(() => {
    async function checkMagicLink() {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        setVerifying(true)
        // Two ways the email reaches this page:
        // 1. One-click flow from a campaign / planning email — the email is
        //    encoded in the magic link URL itself (\`?email=...\`), so the
        //    athlete never had to type it on this device.
        // 2. Two-step flow — the athlete asked for a magic link earlier and
        //    we cached their email + intended redirect in localStorage.
        const params = new URLSearchParams(window.location.search)
        const urlEmail = params.get("email")
        const urlRedirect = params.get("redirect")
        const storedEmail =
          urlEmail || localStorage.getItem("athlete_login_email")
        const storedRedirect =
          urlRedirect || localStorage.getItem("athlete_login_redirect")

        if (!storedEmail) {
          toast.error("Veuillez saisir votre email pour compléter la connexion.")
          setVerifying(false)
          return
        }

        try {
          const result = await signInWithEmailLink(
            auth,
            storedEmail,
            window.location.href
          )
          const idToken = await result.user.getIdToken()
          await createAthleteSession(idToken)

          localStorage.removeItem("athlete_login_email")
          localStorage.removeItem("athlete_login_redirect")

          window.location.href = isSafeRedirect(storedRedirect)
            ? storedRedirect
            : "/home"
          return
        } catch {
          toast.error("La vérification a échoué. Le lien est peut-être expiré.")
        }
        setVerifying(false)
      }
    }

    checkMagicLink()
  }, [])

  async function handleSendLink() {
    if (!email) {
      toast.error("Veuillez saisir votre email.")
      return
    }

    setLoading(true)

    // Store email and redirect in localStorage
    localStorage.setItem("athlete_login_email", email)
    if (redirectUrl) {
      localStorage.setItem("athlete_login_redirect", redirectUrl)
    }

    try {
      const result = await sendAthleteMagicLink(email, redirectUrl)
      if (result.error) {
        toast.error(result.error)
        setLoading(false)
        return
      }
      setLinkSent(true)
    } catch {
      toast.error("Impossible d'envoyer l'email.")
    }
    setLoading(false)
  }

  if (verifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="space-y-4 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="text-muted-foreground">Connexion en cours...</p>
        </div>
      </div>
    )
  }

  if (linkSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mb-4 flex justify-center">
              <Mail className="h-16 w-16 text-blue-600" />
            </div>
            <CardTitle>Vérifiez votre email</CardTitle>
            <CardDescription>
              Un lien de connexion a été envoyé à{" "}
              <span className="font-medium text-foreground">{email}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Cliquez sur le lien dans l&apos;email pour vous connecter.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Timer className="h-10 w-10 text-blue-600" />
          </div>
          <CardTitle>Connexion Athlète</CardTitle>
          <CardDescription>
            Connectez-vous avec votre email pour accéder à votre campagne.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Votre adresse email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendLink()
                }}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSendLink}
              disabled={loading || !email}
            >
              {loading ? "Envoi en cours..." : "Recevoir un lien de connexion"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
