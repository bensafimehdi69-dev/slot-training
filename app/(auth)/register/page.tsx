"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signInWithEmailAndPassword } from "firebase/auth"
import { auth } from "@/lib/firebase/client"
import { registerManager } from "../actions"
import { setManagerAvatar } from "@/app/(manager)/dashboard/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { AvatarPicker } from "@/components/custom/avatar-picker"

export default function RegisterPage() {
  const t = useTranslations("auth")
  const tav = useTranslations("avatar")
  const terr = useTranslations("errors")
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState("")
  // Optional avatar staged in the form; uploaded after the session is
  // established so setManagerAvatar can use the auth cookie.
  const [avatar, setAvatar] = useState<File | null>(null)

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

      // Upload the optional avatar AFTER the session cookie is set so the
      // server action can resolve the manager from the session. Failure
      // doesn't block the redirect — the manager can re-upload from the
      // dashboard header.
      if (avatar) {
        const avatarFormData = new FormData()
        avatarFormData.set("file", avatar)
        const avatarResult = await setManagerAvatar(avatarFormData)
        if (avatarResult.error) {
          toast.error(terr("accountPhotoFailed", { error: avatarResult.error }))
        }
      }

      router.push("/dashboard")
      router.refresh()
    } catch {
      toast.error(t("accountCreatedReconnect"))
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("registerTitle")}</CardTitle>
        <CardDescription>{t("registerSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <AvatarPicker
              name={name}
              size={72}
              ariaLabel={tav("profilePhoto")}
              onChange={setAvatar}
            />
            <p className="text-xs text-muted-foreground">{t("avatarOptional")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">{t("fullName")}</Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("creatingAccount") : t("createMyAccount")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t("alreadyHaveAccount")}{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              {t("signIn")}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
