import { getTranslations } from "next-intl/server"
import { getInvitePreview } from "./actions"
import { InviteClient } from "./invite-client"

export default async function InviteStaffPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const preview = await getInvitePreview(token)

  if (!preview) {
    const t = await getTranslations("inviteStaff")
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-lg border bg-white p-6 text-center shadow">
          <h1 className="mb-2 text-xl font-bold">{t("invalidTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("invalidDescription")}</p>
        </div>
      </div>
    )
  }

  return <InviteClient token={token} preview={preview} />
}
