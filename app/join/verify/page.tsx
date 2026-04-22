"use client"

import { useState, useEffect } from "react"
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth"
import { auth } from "@/lib/firebase/client"
import { completeOnboarding } from "@/app/join/[groupId]/actions"
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
import { StepProgress } from "@/components/custom/step-progress"
import { AddressAutocompleteMap } from "@/components/custom/address-autocomplete-map"
import { ConstraintsTapGrid } from "@/components/custom/constraints-tap-grid"
import { Timer, CheckCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { AddressWithCoords } from "@/lib/types/address"

export default function VerifyPage() {
  const [verifying, setVerifying] = useState(true)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [idToken, setIdToken] = useState<string | null>(null)

  // Join context from localStorage. NOTE: the primary onboarding flow in
  // app/join/[groupId]/join-form.tsx uses a single-page password-based
  // signup and does not redirect through this verify page. This magic-
  // link alternative flow is only reached if some client code writes
  // join_groupId / join_token / join_email into localStorage before
  // triggering sendMagicLink. If no writer exists the page will simply
  // show "Informations d'inscription manquantes".
  const [groupId, setGroupId] = useState("")
  const [inviteToken, setInviteToken] = useState("")

  // Form state
  const [step, setStep] = useState(4)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [homeAddress, setHomeAddress] = useState<AddressWithCoords | null>(null)
  const [schoolAddress, setSchoolAddress] = useState<AddressWithCoords | null>(
    null
  )
  const [constraintsGrid, setConstraintsGrid] = useState<boolean[][]>(
    Array(7)
      .fill(null)
      .map(() => Array(16).fill(true))
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function verifyEmail() {
      const storedEmail = localStorage.getItem("join_email")
      const storedGroupId = localStorage.getItem("join_groupId")
      const storedToken = localStorage.getItem("join_token")

      if (!storedEmail || !storedGroupId || !storedToken) {
        setError(
          "Informations d'inscription manquantes. Veuillez recommencer depuis le lien d'invitation."
        )
        setVerifying(false)
        return
      }

      setGroupId(storedGroupId)
      setInviteToken(storedToken)

      if (isSignInWithEmailLink(auth, window.location.href)) {
        try {
          const result = await signInWithEmailLink(
            auth,
            storedEmail,
            window.location.href
          )
          const token = await result.user.getIdToken()
          setIdToken(token)
          setVerified(true)
        } catch (err) {
          console.error("Email verification error:", err)
          setError(
            "La vérification a échoué. Le lien est peut-être expiré."
          )
        }
      } else {
        setError("Lien de vérification invalide.")
      }

      setVerifying(false)
    }

    verifyEmail()
  }, [])

  async function handleComplete() {
    if (!groupId || !inviteToken) return
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Le nom et le prénom sont requis.")
      return
    }
    if (!homeAddress) {
      toast.error("L'adresse de domicile est requise.")
      return
    }

    setLoading(true)
    const email = localStorage.getItem("join_email") || ""

    // Refresh the ID token in case it expired between verification and submit.
    let freshToken = idToken
    try {
      const currentUser = auth.currentUser
      if (currentUser) {
        freshToken = await currentUser.getIdToken(true)
      }
    } catch {
      // Fallback to the token from initial verification.
    }

    // completeOnboarding signature: (groupId, inviteToken, idToken, data).
    // The manager uid is derived server-side from the invite token — never
    // trusted from localStorage.
    const result = await completeOnboarding(groupId, inviteToken, freshToken || "", {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email,
      homeAddress,
      schoolAddress,
      clubAddress: null,
      constraintsGrid,
    })

    if (result.error) {
      toast.error(result.error)
      setLoading(false)
      return
    }

    localStorage.removeItem("join_groupId")
    localStorage.removeItem("join_token")
    localStorage.removeItem("join_email")

    toast.success("Inscription terminée !")
    setStep(8) // completion step
    setLoading(false)
  }

  if (verifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="space-y-4 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="text-muted-foreground">
            Vérification de votre email...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-red-600">
              Erreur de vérification
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (step === 8) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mb-4 flex justify-center">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
            <CardTitle>Inscription terminée !</CardTitle>
            <CardDescription>
              Votre profil a été créé. Vous recevrez un email lorsqu&apos;une
              campagne d&apos;entraînement sera lancée.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!verified) {
    return null
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Timer className="h-10 w-10 text-blue-600" />
          </div>
          <CardTitle>Complétez votre profil</CardTitle>
          <CardDescription>
            Quelques informations pour optimiser vos créneaux
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StepProgress currentStep={step} totalSteps={7} />

          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  if (!firstName.trim() || !lastName.trim()) {
                    toast.error("Le nom et le prénom sont requis.")
                    return
                  }
                  setStep(5)
                }}
              >
                Continuer
              </Button>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <AddressAutocompleteMap
                label="Adresse de domicile"
                value={homeAddress}
                onChange={setHomeAddress}
                required
              />
              <Button
                className="w-full"
                onClick={() => {
                  if (!homeAddress) {
                    toast.error("L'adresse de domicile est requise.")
                    return
                  }
                  setStep(6)
                }}
              >
                Continuer
              </Button>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <AddressAutocompleteMap
                label="Adresse du lieu d'études (optionnel)"
                value={schoolAddress}
                onChange={setSchoolAddress}
              />
              <Button className="w-full" onClick={() => setStep(7)}>
                {schoolAddress ? "Continuer" : "Passer cette étape"}
              </Button>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <div>
                <Label className="mb-3 block">
                  Vos disponibilités hebdomadaires
                </Label>
                <p className="mb-4 text-sm text-muted-foreground">
                  Touchez les créneaux pour indiquer vos indisponibilités (en
                  gris).
                </p>
                <ConstraintsTapGrid
                  value={constraintsGrid}
                  onChange={setConstraintsGrid}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleComplete}
                disabled={loading}
              >
                {loading
                  ? "Enregistrement..."
                  : "Terminer l'inscription"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
