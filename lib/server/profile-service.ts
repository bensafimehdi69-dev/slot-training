// Server-only profile helpers — NOT a "use server" action file.
//
// These functions accept `uid` as an argument and are intended for
// trusted server-to-server callers (e.g. onboarding flow after the
// Firebase ID token has been verified). Never import this file from a
// Client Component: it would expose uid-bearing writes over the
// Server-Actions boundary (IDOR risk).
//
// Public, session-gated profile access lives in `lib/actions/profile.ts`.

import "server-only"

import { adminDb } from "@/lib/firebase/admin"
import { encryptAddress, decryptAddress } from "@/lib/utils/encryption"
import type { AthleteProfile, ConstraintsGrid } from "@/lib/types/profile"
import type { AddressWithCoords } from "@/lib/types/address"

export interface AthleteProfileInput {
  homeAddress: AddressWithCoords | null
  schoolAddress: AddressWithCoords | null
  clubAddress: AddressWithCoords | null
  constraintsGrid: ConstraintsGrid
}

export async function writeAthleteProfile(uid: string, data: AthleteProfileInput) {
  const profileData: Record<string, unknown> = {
    updatedAt: new Date(),
    constraintsGrid: JSON.stringify(data.constraintsGrid),
  }

  if (data.homeAddress) profileData.homeAddress = encryptAddress(data.homeAddress)
  if (data.schoolAddress) profileData.schoolAddress = encryptAddress(data.schoolAddress)
  if (data.clubAddress) profileData.clubAddress = encryptAddress(data.clubAddress)

  await adminDb.collection("athletes").doc(uid).set(profileData, { merge: true })
}

export async function readAthleteProfile(uid: string): Promise<AthleteProfile | null> {
  const doc = await adminDb.collection("athletes").doc(uid).get()
  if (!doc.exists) return null

  const data = doc.data()!
  return {
    homeAddress: data.homeAddress ? decryptAddress(data.homeAddress) : null,
    schoolAddress: data.schoolAddress ? decryptAddress(data.schoolAddress) : null,
    clubAddress: data.clubAddress ? decryptAddress(data.clubAddress) : null,
    constraintsGrid: data.constraintsGrid
      ? typeof data.constraintsGrid === "string"
        ? JSON.parse(data.constraintsGrid)
        : data.constraintsGrid
      : Array(7)
          .fill(null)
          .map(() => Array(16).fill(true)),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  }
}
