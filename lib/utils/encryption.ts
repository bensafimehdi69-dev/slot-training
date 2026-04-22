import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
// NIST SP 800-38D recommends a 96-bit (12-byte) IV for AES-GCM. Longer IVs
// trigger an internal GHASH pre-processing step and interoperate poorly with
// WebCrypto `AES-GCM`. Stored records include the IV inline as hex, so we can
// change this freely while the data store is empty.
const IV_LENGTH = 12
const MAX_PLAINTEXT_BYTES = 4_096 // ~2 KB of address data is plenty; hard stop against unbounded blobs

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error("ENCRYPTION_KEY is not set")
  const buf = Buffer.from(key, "hex")
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex characters) for AES-256")
  }
  return buf
}

export function encrypt(text: string): string {
  if (Buffer.byteLength(text, "utf8") > MAX_PLAINTEXT_BYTES) {
    throw new Error("Plaintext exceeds MAX_PLAINTEXT_BYTES")
  }
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

/**
 * Throws on authentication-tag mismatch, malformed payload, or any other
 * decrypt failure. Callers MUST handle the thrown error — silently returning
 * a fallback value (e.g. (0, 0) coordinates) would corrupt downstream domain
 * logic such as travel-time optimization.
 */
export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":")
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext: expected iv:tag:payload")
  }
  const [ivHex, tagHex, encHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const encrypted = Buffer.from(encHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  // Explicit UTF-8 decoding on both chunks — defends against future Node
  // version changes to Buffer→string default encoding, and makes intent clear.
  return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8")
}

export interface AddressPayload {
  formatted: string
  lat: number
  lng: number
}

function assertAddressShape(address: AddressPayload): void {
  if (typeof address.formatted !== "string" || address.formatted.length === 0) {
    throw new Error("Address 'formatted' must be a non-empty string")
  }
  if (address.formatted.length > 500) {
    throw new Error("Address 'formatted' exceeds 500 characters")
  }
  if (typeof address.lat !== "number" || !Number.isFinite(address.lat) || address.lat < -90 || address.lat > 90) {
    throw new Error("Address 'lat' must be a finite number in [-90, 90]")
  }
  if (typeof address.lng !== "number" || !Number.isFinite(address.lng) || address.lng < -180 || address.lng > 180) {
    throw new Error("Address 'lng' must be a finite number in [-180, 180]")
  }
}

export function encryptAddress(address: AddressPayload): string {
  assertAddressShape(address)
  return encrypt(JSON.stringify({ formatted: address.formatted, lat: address.lat, lng: address.lng }))
}

/**
 * Throws on any decryption or shape-validation failure. Do not catch-and-coerce
 * to a default address — garbage coordinates flow into Google Maps and the
 * optimizer, producing confidently-wrong results.
 */
export function decryptAddress(encrypted: string): AddressPayload {
  const decrypted = decrypt(encrypted)
  const parsed = JSON.parse(decrypted) as unknown
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Decrypted address is not an object")
  }
  const candidate = parsed as AddressPayload
  assertAddressShape(candidate)
  return candidate
}
