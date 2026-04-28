import "server-only"
import { adminStorage } from "@/lib/firebase/admin"

const MAX_AVATAR_BYTES = 1 * 1024 * 1024 // 1 MiB after the client-side resize.
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const

export type AvatarOwnerType = "managers" | "groups" | "athletes"

/**
 * Persist an avatar in Firebase Storage at a deterministic path and return
 * its public URL. The path uses the entity id (no timestamp / hash), so
 * uploading a new avatar overwrites the previous one — no orphaned files
 * to clean up. We also append `?v=<timestamp>` to the returned URL to
 * defeat the CDN/browser cache when the same path is overwritten.
 */
export async function saveAvatar(
  type: AvatarOwnerType,
  ownerId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    throw new Error(
      `Format non supporté (${file.type || "inconnu"}). Utilise JPG, PNG ou WebP.`,
    )
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error(
      `Image trop lourde (${Math.ceil(file.size / 1024)} Ko). Max ${MAX_AVATAR_BYTES / 1024} Ko.`,
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  // Force the extension to .jpg even if the source is PNG/WebP — the client
  // resize always re-encodes to JPEG, so the bytes match. Keeps URLs stable
  // across re-uploads.
  const path = `avatars/${type}/${ownerId}.jpg`
  const bucket = adminStorage.bucket()
  const fileRef = bucket.file(path)

  await fileRef.save(buffer, {
    metadata: {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=300",
    },
    resumable: false,
  })
  await fileRef.makePublic()

  // The plain "https://storage.googleapis.com/<bucket>/<path>" URL is
  // public-readable once the object is public. Adding a v= cache-buster
  // forces clients to refetch when the same path is overwritten.
  return `https://storage.googleapis.com/${bucket.name}/${path}?v=${Date.now()}`
}

export async function deleteAvatar(
  type: AvatarOwnerType,
  ownerId: string,
): Promise<void> {
  const path = `avatars/${type}/${ownerId}.jpg`
  const bucket = adminStorage.bucket()
  await bucket
    .file(path)
    .delete()
    .catch(() => {
      // Best-effort: a missing file isn't an error from the caller's POV.
    })
}
