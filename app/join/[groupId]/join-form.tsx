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
import { AthleteAvailabilityGrid } from "@/components/custom/athlete-availability-grid"
import { AvatarPicker } from "@/components/custom/avatar-picker"
import { setAthleteAvatar } from "@/lib/actions/profile"
import type { ConstraintCell, ConstraintsGrid } from "@/lib/types/profile"
import { Timer, Shield } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
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
  const t = useTranslations("joinForm")
  const tc = useTranslations("common")
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Step 1: GDPR
  const [gdprConsent, setGdprConsent] = useState(false)

  // Step 2: Account creation
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [idToken, setIdToken] = useState("")

  // Step 3: Name + optional avatar (uploaded after onboarding finishes so
  // the session cookie is already in place).
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [avatar, setAvatar] = useState<File | null>(null)

  // Step 4: Home address
  const [homeAddress, setHomeAddress] = useState<AddressWithCoords | null>(null)

  // Step 5: School address
  const [schoolAddress, setSchoolAddress] = useState<AddressWithCoords | null>(
    null
  )

  // Step 6: Availability — three-state grid (training / school / home).
  const [constraintsGrid, setConstraintsGrid] = useState<ConstraintsGrid>(
    Array(7)
      .fill(null)
      .map(() => Array<ConstraintCell>(16).fill("training"))
  )

  async function handleCreateAccount(): Promise<void> {
    if (!email || !password || !passwordConfirm) {
      toast.error(t("errFillAll"))
      return
    }
    if (password.length < 6) {
      toast.error(t("errPasswordTooShort"))
      return
    }
    if (password !== passwordConfirm) {
      toast.error(t("errPasswordNoMatch"))
      return
    }

    setLoading(true)
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      )
      const newToken = await credential.user.getIdToken()
      setIdToken(newToken)
      setStep(3)
    } catch (error: unknown) {
      const code = (error as { code?: string }).code
      if (code === "auth/email-already-in-use") {
        toast.error(t("errEmailInUse"))
      } else if (code === "auth/invalid-email") {
        toast.error(t("errInvalidEmail"))
      } else if (code === "auth/weak-password") {
        toast.error(t("errWeakPassword"))
      } else {
        toast.error(t("errAccountFailed"))
      }
    }
    setLoading(false)
  }

  async function handleComplete(): Promise<void> {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error(t("errNameRequired"))
      return
    }
    if (!homeAddress) {
      toast.error(t("errHomeAddressRequired"))
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

    // Upload the optional avatar before navigating away. Failure is logged
    // but doesn't block the redirect — the athlete can re-upload from
    // their profile.
    if (avatar) {
      const avatarFormData = new FormData()
      avatarFormData.set("file", avatar)
      const avatarResult = await setAthleteAvatar(avatarFormData)
      if (avatarResult.error) {
        toast.error(t("errAvatarUpload", { error: avatarResult.error }))
      }
    }

    toast.success(t("successDone"))
    // Full-page navigation so the freshly-set session cookie is picked up by
    // the proxy (router.push wouldn't re-issue a request).
    window.location.href = "/home"
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Timer className="h-10 w-10 text-blue-600" />
          </div>
          <CardTitle>{t("title", { group: groupName })}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <StepProgress currentStep={step} totalSteps={6} />

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold">{t("gdprTitle")}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{t("gdprIntro")}</p>
                <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                  <li>{t("gdprItem1")}</li>
                  <li>{t("gdprItem2")}</li>
                  <li>{t("gdprItem3")}</li>
                  <li>{t("gdprItem4")}</li>
                  <li>{t("gdprItem5")}</li>
                </ul>
                <p className="text-sm text-muted-foreground">{t("gdprFooter")}</p>
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
                  {t("gdprConsent")}
                </Label>
              </div>
              <Button
                className="w-full"
                disabled={!gdprConsent}
                onClick={() => setStep(2)}
              >
                {tc("continue")}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("step2Email")}</Label>
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
                <Label htmlFor="password">{t("step2Password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("step2PasswordPlaceholder")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passwordConfirm">{t("step2Confirm")}</Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder={t("step2ConfirmPlaceholder")}
                  required
                />
                {passwordConfirm.length > 0 && password !== passwordConfirm && (
                  <p className="text-xs text-red-600">
                    {t("step2PasswordsNoMatch")}
                  </p>
                )}
              </div>
              <Button
                className="w-full"
                onClick={handleCreateAccount}
                disabled={loading || !email || !password || !passwordConfirm || password !== passwordConfirm}
              >
                {loading ? t("step2Submitting") : t("step2Submit")}
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2">
                <AvatarPicker
                  name={`${firstName} ${lastName}`}
                  size={72}
                  ariaLabel={t("step3AvatarAria")}
                  onChange={setAvatar}
                />
                <p className="text-xs text-muted-foreground">{t("step3AvatarOptional")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">{t("step3FirstName")}</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t("step3LastName")}</Label>
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
                    toast.error(t("errNameRequired"))
                    return
                  }
                  setStep(4)
                }}
              >
                {tc("continue")}
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <AddressAutocompleteMap
                label={t("step4HomeAddress")}
                value={homeAddress}
                onChange={setHomeAddress}
                required
              />
              <Button
                className="w-full"
                onClick={() => {
                  if (!homeAddress) {
                    toast.error(t("errHomeAddressRequired"))
                    return
                  }
                  setStep(5)
                }}
              >
                {tc("continue")}
              </Button>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <AddressAutocompleteMap
                label={t("step5SchoolAddress")}
                value={schoolAddress}
                onChange={setSchoolAddress}
              />
              <Button className="w-full" onClick={() => setStep(6)}>
                {schoolAddress ? tc("continue") : t("step5Skip")}
              </Button>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <div>
                <Label className="mb-3 block">{t("step6Title")}</Label>
                <p className="mb-4 text-sm text-muted-foreground">
                  {t("step6Hint")}
                </p>
                <AthleteAvailabilityGrid
                  value={constraintsGrid}
                  onChange={setConstraintsGrid}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleComplete}
                disabled={loading}
              >
                {loading ? t("step6Submitting") : t("step6Submit")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
