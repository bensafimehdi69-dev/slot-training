"use client"

import { useState } from "react"
import { createUserWithEmailAndPassword } from "firebase/auth"
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
import { Checkbox } from "@/components/ui/checkbox"
import { StepProgress } from "@/components/custom/step-progress"
import { AddressAutocompleteMap } from "@/components/custom/address-autocomplete-map"
import { ConstraintsTapGrid } from "@/components/custom/constraints-tap-grid"
import { Timer, CheckCircle, Shield } from "lucide-react"
import { toast } from "sonner"
import type { AddressWithCoords } from "@/lib/types/address"

interface JoinFormProps {
  groupId: string
  groupName: string
  token: string
}

export function JoinForm({
  groupId,
  groupName,
  token,
}: JoinFormProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Step 1: GDPR
  const [gdprConsent, setGdprConsent] = useState(false)

  // Step 2: Account creation
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [idToken, setIdToken] = useState("")

  // Step 3: Name
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")

  // Step 4: Home address
  const [homeAddress, setHomeAddress] = useState<AddressWithCoords | null>(null)

  // Step 5: School address
  const [schoolAddress, setSchoolAddress] = useState<AddressWithCoords | null>(
    null
  )

  // Step 6: Availability
  const [constraintsGrid, setConstraintsGrid] = useState<boolean[][]>(
    Array(7)
      .fill(null)
      .map(() => Array(16).fill(true))
  )

  async function handleCreateAccount(): Promise<void> {
    if (!email || !password) {
      toast.error("Veuillez remplir tous les champs.")
      return
    }
    if (password.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères.")
      return
    }

    setLoading(true)
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      )
      const token = await credential.user.getIdToken()
      setIdToken(token)
      setStep(3)
    } catch (error: unknown) {
      const code = (error as { code?: string }).code
      if (code === "auth/email-already-in-use") {
        toast.error("Cette adresse email est déjà utilisée.")
      } else if (code === "auth/invalid-email") {
        toast.error("Adresse email invalide.")
      } else if (code === "auth/weak-password") {
        toast.error("Le mot de passe est trop faible.")
      } else {
        toast.error("Impossible de créer le compte. Veuillez réessayer.")
      }
    }
    setLoading(false)
  }

  async function handleComplete(): Promise<void> {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Le nom et le prénom sont requis.")
      return
    }
    if (!homeAddress) {
      toast.error("L'adresse de domicile est requise.")
      return
    }

    setLoading(true)

    // Refresh token in case it expired during the form
    let freshToken = idToken
    const currentUser = auth.currentUser
    if (currentUser) {
      try {
        freshToken = await currentUser.getIdToken(true)
      } catch {
        // Use existing token as fallback
      }
    }

    // Create session so the athlete is logged in
    try {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: freshToken }),
      })
    } catch {
      // Non-blocking: session creation failure should not stop onboarding
    }

    const result = await completeOnboarding(groupId, token, freshToken, {
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

    toast.success("Inscription terminée !")
    setStep(7)
    setLoading(false)
  }

  // Completion screen
  if (step === 7) {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Timer className="h-10 w-10 text-blue-600" />
          </div>
          <CardTitle>Rejoindre {groupName}</CardTitle>
          <CardDescription>
            Complétez votre inscription en quelques minutes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StepProgress currentStep={step} totalSteps={6} />

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold">Protection de vos données</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Pour optimiser vos créneaux d&apos;entraînement, nous
                  collectons :
                </p>
                <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                  <li>Votre nom et prénom</li>
                  <li>Votre adresse email</li>
                  <li>Vos adresses (domicile, études, club)</li>
                  <li>Votre emploi du temps hebdomadaire</li>
                  <li>Vos contraintes de disponibilité</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Vos adresses sont chiffrées et ne sont jamais partagées avec
                  votre entraîneur. Vous pouvez supprimer vos données à tout
                  moment.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="gdpr"
                  checked={gdprConsent}
                  onCheckedChange={(checked) =>
                    setGdprConsent(checked === true)
                  }
                />
                <Label
                  htmlFor="gdpr"
                  className="cursor-pointer text-sm leading-relaxed"
                >
                  J&apos;accepte la collecte et le traitement de mes données
                  personnelles telles que décrites ci-dessus.
                </Label>
              </div>
              <Button
                className="w-full"
                disabled={!gdprConsent}
                onClick={() => setStep(2)}
              >
                Continuer
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Adresse email</Label>
                <Input
                  id="email"
                  type="email"
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6 caractères minimum"
                  required
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreateAccount}
                disabled={loading || !email || !password}
              >
                {loading ? "Création du compte..." : "Créer mon compte"}
              </Button>
            </div>
          )}

          {step === 3 && (
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
                  setStep(4)
                }}
              >
                Continuer
              </Button>
            </div>
          )}

          {step === 4 && (
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
                label="Adresse du lieu d'études (optionnel)"
                value={schoolAddress}
                onChange={setSchoolAddress}
              />
              <Button className="w-full" onClick={() => setStep(6)}>
                {schoolAddress ? "Continuer" : "Passer cette étape"}
              </Button>
            </div>
          )}

          {step === 6 && (
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
