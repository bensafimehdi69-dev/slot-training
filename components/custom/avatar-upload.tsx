"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Camera, Loader2 } from "lucide-react"
import { Avatar } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { resizeImageToSquareJpeg } from "@/lib/utils/image"

interface AvatarUploadProps {
  src?: string | null
  name?: string
  size?: number
  // Action that uploads the resized avatar to Storage and persists the URL.
  // Called with a FormData containing one field, "file" — keeps the action
  // shape simple and lets the caller handle entity-specific concerns
  // (groupId, athleteId, …) inline.
  onUpload: (formData: FormData) => Promise<{ avatarUrl?: string; error?: string }>
  onUploaded?: (avatarUrl: string) => void
  ariaLabel?: string
  className?: string
  // Hidden when the viewer can't change the avatar (e.g. spectator role).
  readOnly?: boolean
}

/**
 * Round avatar with a small camera button overlay. Tapping the button opens
 * the file picker, the image is resized client-side and uploaded via the
 * server action passed in `onUpload`. The optimistic preview switches as
 * soon as the resize completes so the user sees something immediately.
 */
export function AvatarUpload({
  src,
  name,
  size = 80,
  onUpload,
  onUploaded,
  ariaLabel,
  className,
  readOnly,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const displayedSrc = previewUrl ?? src ?? undefined

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const resized = await resizeImageToSquareJpeg(file, 256, 0.85)
      // Optimistic preview from the local blob — flickers exactly once when
      // we swap it for the real CDN URL on success.
      const localUrl = URL.createObjectURL(resized)
      setPreviewUrl(localUrl)

      const formData = new FormData()
      formData.set("file", resized)
      const result = await onUpload(formData)

      URL.revokeObjectURL(localUrl)
      if (result.error || !result.avatarUrl) {
        setPreviewUrl(null)
        toast.error(result.error ?? "Upload échoué.")
        return
      }
      setPreviewUrl(result.avatarUrl)
      onUploaded?.(result.avatarUrl)
    } catch (error) {
      setPreviewUrl(null)
      toast.error(
        error instanceof Error ? error.message : "Impossible de traiter cette image.",
      )
    } finally {
      setUploading(false)
    }
  }

  // Once a photo is set, the avatar itself becomes the click target and the
  // camera badge disappears — the photo is its own affordance. Without a
  // photo, the badge shows so the user knows they can upload.
  const hasPhoto = Boolean(displayedSrc)
  const interactive = !readOnly

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        type="button"
        disabled={!interactive || uploading}
        onClick={() => interactive && inputRef.current?.click()}
        className={cn(
          "block rounded-full",
          interactive && "cursor-pointer",
          uploading && "opacity-70",
        )}
        aria-label={ariaLabel ?? "Changer la photo"}
      >
        <Avatar src={displayedSrc} name={name} size={size} alt={ariaLabel ?? name} />
      </button>
      {interactive && (
        <>
          {(uploading || !hasPhoto) && (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full",
                "border border-white bg-blue-600 text-white shadow",
              )}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Reset the input so the same file can be re-picked later if
              // the user wants to retry.
              e.target.value = ""
              if (file) void handleFile(file)
            }}
          />
        </>
      )}
    </div>
  )
}
