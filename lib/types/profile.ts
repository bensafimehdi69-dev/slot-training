import type { AddressWithCoords } from "./address"

export interface AthleteProfile {
  homeAddress: AddressWithCoords | null
  schoolAddress: AddressWithCoords | null
  clubAddress: AddressWithCoords | null
  constraintsGrid: boolean[][]
  updatedAt: Date
}

export type ConstraintsGrid = boolean[][]
