"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Timer, Loader2, Save, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AddressAutocompleteMap } from "@/components/custom/address-autocomplete-map"
import { ConstraintsTapGrid } from "@/components/custom/constraints-tap-grid"
import { LogoutButton } from "@/components/custom/logout-button"
import { saveAthleteProfile } from "@/lib/actions/profile"
import type { AddressWithCoords } from "@/lib/types/address"
import type { ConstraintsGrid } from "@/lib/types/profile"

interface HomeClientProps {
  email: string
  profile: {
    homeAddress: AddressWithCoords | null
    schoolAddress: AddressWithCoords | null
    clubAddress: AddressWithCoords | null
    constraintsGrid: ConstraintsGrid
  }
}

export function HomeClient({ email, profile }: HomeClientProps) {
  const [homeAddress, setHomeAddress] = useState(profile.homeAddress)
  const [schoolAddress, setSchoolAddress] = useState(profile.schoolAddress)
  const [clubAddress, setClubAddress] = useState(profile.clubAddress)
  const [constraintsGrid, setConstraintsGrid] = useState<ConstraintsGrid>(
    profile.constraintsGrid
  )
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!homeAddress) {
      toast.error("L'adresse de domicile est requise.")
      return
    }
    setSaving(true)
    const result = await saveAthleteProfile({
      homeAddress,
      schoolAddress,
      clubAddress,
      constraintsGrid,
    })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Profil mis à jour.")
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Timer className="h-6 w-6 text-blue-600" />
            Slot Training
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">Mon profil</h1>
          <p className="text-muted-foreground">
            Gérez vos disponibilités et adresses. Ces informations seront
            pré-remplies à chaque nouvelle campagne.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Mes adresses</CardTitle>
            <CardDescription>
              Utilisées pour calculer vos temps de trajet vers l&apos;entraînement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AddressAutocompleteMap
              label="Adresse de domicile"
              value={homeAddress}
              onChange={setHomeAddress}
              required
            />
            <AddressAutocompleteMap
              label="Adresse du lieu d'études (optionnel)"
              value={schoolAddress}
              onChange={setSchoolAddress}
            />
            <AddressAutocompleteMap
              label="Adresse du club (optionnel)"
              value={clubAddress}
              onChange={setClubAddress}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mes disponibilités hebdomadaires</CardTitle>
            <CardDescription>
              Touchez les créneaux pour indiquer vos indisponibilités (en gris).
              Vous pourrez toujours ajuster ces dispos spécifiquement pour chaque
              campagne.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConstraintsTapGrid
              value={constraintsGrid}
              onChange={setConstraintsGrid}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Campagnes d&apos;entraînement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Vous recevez un email à chaque nouvelle campagne avec un lien
              direct pour répondre. Votre planning validé vous est également
              envoyé par email — pensez à vérifier vos spams si vous ne le
              trouvez pas.
            </p>
          </CardContent>
        </Card>

        <div className="sticky bottom-4 flex justify-end">
          <Button size="lg" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Enregistrer les modifications
          </Button>
        </div>
      </main>
    </div>
  )
}
