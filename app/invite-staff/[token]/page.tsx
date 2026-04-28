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
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-lg border bg-white p-6 text-center shadow">
          <h1 className="mb-2 text-xl font-bold">Invitation invalide</h1>
          <p className="text-sm text-muted-foreground">
            Ce lien d&apos;invitation n&apos;existe pas ou a expiré. Demande à
            la personne qui t&apos;a invité de t&apos;envoyer un nouveau lien.
          </p>
        </div>
      </div>
    )
  }

  return <InviteClient token={token} preview={preview} />
}
