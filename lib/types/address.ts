import { z } from "zod"

export interface AddressWithCoords {
  formatted: string
  lat: number
  lng: number
}

export const addressSchema = z.object({
  formatted: z.string().min(1, "L'adresse est requise"),
  lat: z.number(),
  lng: z.number(),
})
