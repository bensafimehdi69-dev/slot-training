import type { DaySchedule } from "@/lib/types/schedule"
import type { AddressWithCoords } from "@/lib/types/address"

interface DepartureResult {
  address: AddressWithCoords
  label: "domicile" | "école"
  availableFromTime: string | null
  conflict: boolean
  conflictReason?: string
}

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

  for (const hourStr of daySchedule) {
    const classStartMinutes = timeToMinutes(hourStr)
    const classEndMinutes = classStartMinutes + 60
    if (classStartMinutes <= slotStartMinutes && classEndMinutes > slotStartMinutes) {
      return {
        address: homeAddress,
        label: "domicile",
        availableFromTime: null,
        conflict: true,
        conflictReason: `Cours jusqu'à ${minutesToTime(classEndMinutes)}`,
      }
    }
  }

  const sortedClasses = [...daySchedule].map(timeToMinutes).sort((a, b) => a - b)

  const lastClassBeforeSlot = sortedClasses
    .filter((classStart) => classStart + 60 <= slotStartMinutes)
    .pop()

  if (lastClassBeforeSlot !== undefined && schoolAddress) {
    return {
      address: schoolAddress,
      label: "école",
      availableFromTime: minutesToTime(lastClassBeforeSlot + 60),
      conflict: false,
    }
  }

  return {
    address: homeAddress,
    label: "domicile",
    availableFromTime: null,
    conflict: false,
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
