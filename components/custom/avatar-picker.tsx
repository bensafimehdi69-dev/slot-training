"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Camera, Loader2, X } from "lucide-react"
import { Avatar } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { resizeImageToSquareJpeg } from "@/lib/utils/image"

interface AvatarPickerProps {
  name?: string
  size?: number
  ariaLabel?: string
  className?: string
  // Notifies the parent every time the picked file changes. The file is
  // already resized to a 256×256 JPEG so the parent just has to forward it
  // to the upload server action after the parent entity is created.
  onChange: (file: File | null) => void
}

/**
 * Pure file-picker variant of <AvatarUpload>: resizes a chosen image to a
 * 256×256 JPEG and hands it back via `onChange`. Used in creation forms
 * where the entity (group, manager, athlete) doesn't exist yet — the parent
 * stores the resized file and uploads it once the create call returns the
 * new id.
 */
export function AvatarPicker({
  name,
  size = 80,
  ariaLabel,
  className,
  onChange,
}: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hasPhoto = previewUrl !== null

  // Revoke any blob URL we created when unmounting or replacing — otherwise
  // the browser keeps the bytes alive for the rest of the session.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function handleFile(file: File) {
    setBusy(true)
    try {
      const resized = await resizeImageToSquareJpeg(file, 256, 0.85)
      const url = URL.createObjectURL(resized)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
      onChange(resized)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de traiter cette image.",
      )
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    onChange(null)
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={cn("block rounded-full", busy && "opacity-70")}
        aria-label={ariaLabel ?? "Choisir une photo"}
      >
        <Avatar src={previewUrl} name={name} size={size} alt={ariaLabel ?? name} />
      </button>
      {(busy || !hasPhoto) && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-blue-600 text-white shadow"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
        </span>
      )}
      {hasPhoto && !busy && (
        // Small clear button so the user can undo a wrong pick without
        // submitting and removing later.
        <button
          type="button"
          onClick={clear}
          aria-label="Retirer la photo"
          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-gray-700 text-white shadow hover:bg-gray-800"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) void handleFile(file)
        }}
      />
    </div>
  )
}
