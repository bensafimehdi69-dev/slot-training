import * as React from "react"
import { cn } from "@/lib/utils"

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null
  // Used to derive the initials when there's no image. Pass the first name
  // (or "John Doe") — we strip whitespace and take up to 2 letters.
  name?: string
  // Visual size in pixels. Defaults to 40.
  size?: number
  alt?: string
}

function initialsOf(name?: string): string {
  if (!name) return ""
  const trimmed = name.trim()
  if (!trimmed) return ""
  const parts = trimmed.split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("")
}

/**
 * Round avatar with image fallback to coloured initials. Images are loaded
 * with `loading="lazy"` since most avatars sit below the fold (athletes
 * list, group cards) and we don't want them blocking layout.
 */
export function Avatar({
  src,
  name,
  size = 40,
  alt,
  className,
  style,
  ...rest
}: AvatarProps) {
  const initials = initialsOf(name) || "?"
  const dimension = { width: size, height: size, fontSize: size * 0.4 }

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-full bg-blue-100 text-blue-700",
        "inline-flex items-center justify-center font-semibold uppercase",
        className,
      )}
      style={{ ...dimension, ...style }}
      aria-label={alt ?? name}
      {...rest}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? name ?? ""}
          width={size}
          height={size}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  )
}
