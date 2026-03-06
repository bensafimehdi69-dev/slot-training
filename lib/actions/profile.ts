"use server"

import { adminDb } from "@/lib/firebase/admin"
import { encryptAddress, decryptAddress } from "@/lib/utils/encryption"
import type { AthleteProfile, ConstraintsGrid } from "@/lib/types/profile"
import type { AddressWithCoords } from "@/lib/types/address"

export async function saveAthleteProfile(
  uid: string,
  data: {
    homeAddress: AddressWithCoords | null
    schoolAddress: AddressWithCoords | null
    clubAddress: AddressWithCoords | null
    constraintsGrid: ConstraintsGrid
  }
) {
  const profileData: Record<string, unknown> = {
    updatedAt: new Date(),
    constraintsGrid: data.constraintsGrid,
  }

  if (data.homeAddress) profileData.homeAddress = encryptAddress(data.homeAddress)
  if (data.schoolAddress) profileData.schoolAddress = encryptAddress(data.schoolAddress)
  if (data.clubAddress) profileData.clubAddress = encryptAddress(data.clubAddress)

  await adminDb.collection("athletes").doc(uid).set(profileData, { merge: true })
}

export async function getAthleteProfile(uid: string): Promise<AthleteProfile | null> {
  const doc = await adminDb.collection("athletes").doc(uid).get()
  if (!doc.exists) return null

  const data = doc.data()!
  return {
    homeAddress: data.homeAddress ? decryptAddress(data.homeAddress) : null,
    schoolAddress: data.schoolAddress ? decryptAddress(data.schoolAddress) : null,
    clubAddress: data.clubAddress ? decryptAddress(data.clubAddress) : null,
    constraintsGrid: data.constraintsGrid || Array(7).fill(null).map(() => Array(15).fill(true)),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  }
}
