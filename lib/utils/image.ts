/**
 * Resize an image File to a square JPEG of at most `maxSize` px and at
 * the given quality. Used to compress avatars before upload so we ship a
 * predictable ~30-50 KB blob to the server regardless of what the user
 * picked from their camera roll.
 *
 * Returns a new File with `image/jpeg` MIME and the .jpg extension so
 * downstream FormData / Storage stay consistent.
 */
export async function resizeImageToSquareJpeg(
  file: File,
  maxSize = 256,
  quality = 0.85,
): Promise<File> {
  const bitmap = await createImageBitmap(file)
  // Cover-fit a square: pick the smaller dimension as the source square.
  const srcSize = Math.min(bitmap.width, bitmap.height)
  const dx = (bitmap.width - srcSize) / 2
  const dy = (bitmap.height - srcSize) / 2

  const targetSize = Math.min(maxSize, srcSize)
  const canvas = document.createElement("canvas")
  canvas.width = targetSize
  canvas.height = targetSize
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas non supporté par ce navigateur.")
  ctx.drawImage(bitmap, dx, dy, srcSize, srcSize, 0, 0, targetSize, targetSize)
  bitmap.close?.()

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Compression de l'image échouée."))),
      "image/jpeg",
      quality,
    )
  })

  return new File([blob], "avatar.jpg", { type: "image/jpeg" })
}
