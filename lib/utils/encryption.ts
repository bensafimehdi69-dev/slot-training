import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error("ENCRYPTION_KEY is not set")
  return Buffer.from(key, "hex")
}

export function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decrypt(encryptedText: string): string {
  const [ivHex, tagHex, encHex] = encryptedText.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const encrypted = Buffer.from(encHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final("utf8")
}

export function encryptAddress(address: { formatted: string; lat: number; lng: number }): string {
  return encrypt(JSON.stringify(address))
}

export function decryptAddress(encrypted: string): { formatted: string; lat: number; lng: number } {
  try {
    const decrypted = decrypt(encrypted)
    return JSON.parse(decrypted)
  } catch {
    return { formatted: encrypted, lat: 0, lng: 0 }
  }
}
