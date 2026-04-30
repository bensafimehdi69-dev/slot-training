import { getTranslations } from "next-intl/server"
import { LanguagePicker } from "@/components/custom/language-picker"
import { validateInviteToken } from "./actions"
import { JoinForm } from "./join-form"

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { groupId } = await params
  const { token } = await searchParams
  const t = await getTranslations("errors")

  // Floating language picker so an athlete who lands on the join link
  // before they've ever opened the app can switch the onboarding language
  // before any data is filled in.
  const localeToggle = (
    <div className="absolute right-4 top-4">
      <LanguagePicker />
    </div>
  )

  if (!token) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-gray-50 p-4">
        {localeToggle}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">{t("invalidLinkTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("inviteIncomplete")}</p>
        </div>
      </div>
    )
  }

  const result = await validateInviteToken(groupId, token)
  if (result.error) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-gray-50 p-4">
        {localeToggle}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">{t("invalidLinkTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{result.error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {localeToggle}
      <JoinForm
        groupId={groupId}
        groupName={result.data!.groupName}
        token={token}
      />
    </div>
  )
}
