"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AvatarUpload } from "@/components/custom/avatar-upload"
import { setManagerAvatar } from "@/app/(manager)/dashboard/actions"

interface ManagerAvatarMenuProps {
  name: string
  avatarUrl: string | null
}

/**
 * Header slot for the manager: their avatar with the camera overlay used to
 * upload a new photo. The name still shows on >=sm screens but the avatar
 * is the primary affordance now (mobile-first).
 */
export function ManagerAvatarMenu({ name, avatarUrl }: ManagerAvatarMenuProps) {
  const router = useRouter()
  const [currentUrl, setCurrentUrl] = useState<string | null>(avatarUrl)

  return (
    <div className="flex items-center gap-2">
      <AvatarUpload
        src={currentUrl}
        name={name}
        size={36}
        ariaLabel="Changer ma photo"
        onUpload={(formData) => setManagerAvatar(formData)}
        onUploaded={(url) => {
          setCurrentUrl(url)
          // Refresh the layout so the new URL also flows into nested
          // server components on the next navigation.
          router.refresh()
        }}
      />
      <span className="hidden max-w-[140px] truncate text-sm text-muted-foreground sm:inline sm:max-w-none">
        {name}
      </span>
    </div>
  )
}
