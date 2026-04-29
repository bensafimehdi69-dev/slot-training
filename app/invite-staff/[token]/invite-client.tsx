"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Loader2, UserPlus, LogIn } from "lucide-react"
import { auth } from "@/lib/firebase/client"
import { acceptStaffInvite, type InvitePreview } from "./actions"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AvatarPicker } from "@/components/custom/avatar-picker"
import { setManagerAvatar } from "@/app/(manager)/dashboard/actions"

interface InviteClientProps {
  token: string
  preview: InvitePreview
}

/**
 * Landing page for someone who clicked an /invite-staff/<token> email link.
 * The flow branches on whether the recipient already has a Firebase Auth
 * user:
 *   - already a user → render a "Sign in" card with email read-only +
 *     password. On success: POST the idToken to /api/auth/login to set the
 *     session cookie, then call acceptStaffInvite to attach the viewer.
 *   - no user yet → render a "Create account" card with name + password
 *     + optional avatar. On success: createUserWithEmailAndPassword,
 *     register the manager profile via acceptStaffInvite (which also sets
 *     name + email idempotently), then redirect to /dashboard.
 */
export function InviteClient({ token, preview }: InviteClientProps) {
  const router = useRouter()
  const t = useTranslations("inviteStaff")
  const tav = useTranslations("avatar")
  const terr = useTranslations("errors")
  const isLogin = preview.alreadyHasAccount
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [avatar, setAvatar] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  async function setSession(idToken: string) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    })
    if (!res.ok) throw new Error("Session creation failed")
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      // Two-branch auth: sign-in (existing) or sign-up (new). Email is
      // fixed by the invite — we never let the recipient change it,
      // otherwise the server-side email check on acceptStaffInvite
      // would fail.
      const credential = isLogin
        ? await signInWithEmailAndPassword(auth, preview.email, password)
        : await createUserWithEmailAndPassword(auth, preview.email, password)
      const idToken = await credential.user.getIdToken()
      await setSession(idToken)

      const result = await acceptStaffInvite(token)
      if (result.error) {
        toast.error(result.error)
        return
      }

      // Optional avatar (sign-up flow only). Failure is non-blocking.
      if (!isLogin && avatar) {
        const avatarFormData = new FormData()
        avatarFormData.set("file", avatar)
        const avatarResult = await setManagerAvatar(avatarFormData)
        if (avatarResult.error) {
          toast.error(terr("accountPhotoFailed", { error: avatarResult.error }))
        }
      }

      // Optional name update on sign-up. acceptStaffInvite already wrote
      // the manager doc; we patch the displayed name via a fresh write.
      if (!isLogin && name.trim()) {
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        }).catch(() => {})
      }

      toast.success(
        isLogin ? t("connectedSuccess") : t("createdSuccess"),
      )
      // Full reload so the freshly-set session cookie is picked up by
      // the middleware on /dashboard.
      window.location.href = "/dashboard"
    } catch (error: unknown) {
      const code = (error as { code?: string }).code
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        toast.error(terr("wrongPassword"))
      } else if (code === "auth/weak-password") {
        toast.error(terr("weakPassword"))
      } else if (code === "auth/email-already-in-use") {
        toast.error(terr("emailInUse"))
      } else {
        toast.error(
          error instanceof Error ? error.message : terr("genericError"),
        )
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Avatar name={preview.inviterName || preview.email} size={56} />
          </div>
          <CardTitle>
            {isLogin
              ? t("acceptInvitation")
              : t("joinGroup", { group: preview.groupName })}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? t("loginPrompt", {
                  inviter: preview.inviterName,
                  group: preview.groupName,
                })
              : t("createPrompt", {
                  inviter: preview.inviterName,
                  group: preview.groupName,
                })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="flex flex-col items-center gap-2">
                <AvatarPicker
                  name={name}
                  size={72}
                  ariaLabel={tav("profilePhoto")}
                  onChange={setAvatar}
                />
                <p className="text-xs text-muted-foreground">{t("photoOptional")}</p>
              </div>
            )}
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">{t("fullName")}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" value={preview.email} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                {isLogin ? t("password") : t("passwordHint")}
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isLogin ? undefined : 8}
                autoComplete={isLogin ? "current-password" : "new-password"}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isLogin ? (
                <LogIn className="mr-2 h-4 w-4" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              {isLogin ? t("loginAndAccept") : t("createMyAccount")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
