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

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Lien invalide</h1>
          <p className="mt-2 text-muted-foreground">
            Ce lien d&apos;invitation est incomplet.
          </p>
        </div>
      </div>
    )
  }

  const result = await validateInviteToken(groupId, token)
  if (result.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Lien invalide</h1>
          <p className="mt-2 text-muted-foreground">{result.error}</p>
        </div>
      </div>
    )
  }

  return (
    <JoinForm
      groupId={groupId}
      groupName={result.data!.groupName}
      token={token}
    />
  )
}
