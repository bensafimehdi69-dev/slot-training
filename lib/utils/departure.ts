import type { DaySchedule } from "@/lib/types/schedule"
import type { AddressWithCoords } from "@/lib/types/address"

interface DepartureResult {
  address: AddressWithCoords
  label: "domicile" | "école"
  availableFromTime: string | null
  conflict: boolean
  conflictReason?: string
}

/**
 * Where is the athlete during the hour right before \`slotStartTime\`, and is
 * any class running at \`slotStartTime\` itself?
 *
 * Lot 4 changed \`DaySchedule\` from a plain string[] of class hours to a
 * ScheduleSlot[] that records the explicit location ("school" / "home") on
 * each occupied cell, so we no longer have to guess that "occupied = at
 * school". The athlete tells us directly.
 */
export function getDepartureInfo(
  daySchedule: DaySchedule,
  slotStartTime: string,
  homeAddress: AddressWithCoords,
  schoolAddress: AddressWithCoords | null
): DepartureResult {
  if (!daySchedule || daySchedule.length === 0) {
    return {
      address: homeAddress,
      label: "domicile",
      availableFromTime: null,
      conflict: false,
    }
  }

  const slotStartMinutes = timeToMinutes(slotStartTime)

  for (const slot of daySchedule) {
    const classStartMinutes = timeToMinutes(slot.hour)
    const classEndMinutes = classStartMinutes + 60
    if (classStartMinutes <= slotStartMinutes && classEndMinutes > slotStartMinutes) {
      const isHome = slot.location === "home"
      return {
        address: isHome ? homeAddress : (schoolAddress ?? homeAddress),
        label: isHome ? "domicile" : "école",
        availableFromTime: null,
        conflict: true,
        conflictReason: isHome
          ? `À la maison jusqu'à ${minutesToTime(classEndMinutes)}`
          : `Cours jusqu'à ${minutesToTime(classEndMinutes)}`,
      }
    }
  }

  // Find the most recent occupied slot that finishes before the training slot
  // starts; the location on that slot is the actual departure point.
  const sortedSlots = [...daySchedule].sort(
    (a, b) => timeToMinutes(a.hour) - timeToMinutes(b.hour)
  )
  let lastSlotBefore: { endMinutes: number; location: "school" | "home" } | null = null
  for (const slot of sortedSlots) {
    const startMinutes = timeToMinutes(slot.hour)
    const endMinutes = startMinutes + 60
    if (endMinutes <= slotStartMinutes) {
      lastSlotBefore = { endMinutes, location: slot.location }
    }
  }

  if (lastSlotBefore) {
    if (lastSlotBefore.location === "school" && schoolAddress) {
      return {
        address: schoolAddress,
        label: "école",
        availableFromTime: minutesToTime(lastSlotBefore.endMinutes),
        conflict: false,
      }
    }
    if (lastSlotBefore.location === "home") {
      return {
        address: homeAddress,
        label: "domicile",
        availableFromTime: minutesToTime(lastSlotBefore.endMinutes),
        conflict: false,
      }
    }
  }

  return {
    address: homeAddress,
    label: "domicile",
    availableFromTime: null,
    conflict: false,
  }
}

interface ReturnResult {
  // Where the athlete needs to be after the training slot finishes — the
  // first occupied cell that comes after \`slotEndTime\` decides this. If
  // there's no next class on the same day we default to "home".
  address: AddressWithCoords
  label: "domicile" | "école"
  // The wall-clock minute the athlete must have arrived at \`address\` by.
  // null means "no hard deadline today".
  mustArriveByMinutes: number | null
}

export function getReturnInfo(
  daySchedule: DaySchedule,
  slotEndTime: string,
  homeAddress: AddressWithCoords,
  schoolAddress: AddressWithCoords | null
): ReturnResult {
  const slotEndMinutes = timeToMinutes(slotEndTime)

  // Sort by start hour then take the first slot that starts at or after the
  // training ends. (We treat a slot starting exactly at slotEndTime as the
  // next destination — the athlete must arrive by then.)
  const sortedSlots = [...(daySchedule ?? [])].sort(
    (a, b) => timeToMinutes(a.hour) - timeToMinutes(b.hour)
  )
  const next = sortedSlots.find((s) => timeToMinutes(s.hour) >= slotEndMinutes)
  if (!next) {
    return { address: homeAddress, label: "domicile", mustArriveByMinutes: null }
  }

  const isHome = next.location === "home"
  return {
    address: isHome ? homeAddress : (schoolAddress ?? homeAddress),
    label: isHome ? "domicile" : "école",
    mustArriveByMinutes: timeToMinutes(next.hour),
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}
