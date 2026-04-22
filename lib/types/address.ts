import { z } from "zod"

export interface AddressWithCoords {
  formatted: string
  lat: number
  lng: number
}

/**
 * Validates an address coming from the client. Coordinate bounds match
 * `assertAddressShape` in `lib/utils/encryption.ts` — keep them in sync.
 */
export const addressSchema = z.object({
  formatted: z.string().trim().min(1, "L'adresse est requise").max(500),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
})
