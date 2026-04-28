export type DayKey =
  | "dimanche"
  | "lundi"
  | "mardi"
  | "mercredi"
  | "jeudi"
  | "vendredi"
  | "samedi"

export const dayLabels: Record<DayKey, string> = {
  dimanche: "Dimanche",
  lundi: "Lundi",
  mardi: "Mardi",
  mercredi: "Mercredi",
  jeudi: "Jeudi",
  vendredi: "Vendredi",
  samedi: "Samedi",
}

// 3-letter abbreviations for narrow grid headers (the schedule grid has 7
// columns on a phone screen, so the full names overlap).
export const dayLabelsShort: Record<DayKey, string> = {
  dimanche: "Dim",
  lundi: "Lun",
  mardi: "Mar",
  mercredi: "Mer",
  jeudi: "Jeu",
  vendredi: "Ven",
  samedi: "Sam",
}

// Week starts on Sunday (Saudi/Gulf convention) and ends on Saturday — the
// order here drives every column header in the schedule grid and every loop
// in the optimiser.
export const dayKeys: DayKey[] = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
]

// Each busy hour now records WHERE the athlete is (school or home), so the
// optimiser can compute the trip from the actual previous location instead
// of inferring it from the schedule shape. Pre-Lot-4 responses stored a
// plain string[] of hours; the migration helper below upgrades them to
// "school" by default (the previous heuristic).
export type SlotLocation = "school" | "home"
export interface ScheduleSlot {
  hour: string // "HH:00"
  location: SlotLocation
}
export type DaySchedule = ScheduleSlot[]
export type WeeklySchedule = Record<DayKey, DaySchedule>

export function migrateDaySchedule(raw: unknown): DaySchedule {
  if (!Array.isArray(raw)) return []
  const out: DaySchedule = []
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ hour: item, location: "school" })
    } else if (
      item &&
      typeof item === "object" &&
      typeof (item as { hour?: unknown }).hour === "string"
    ) {
      const loc = (item as { location?: unknown }).location
      out.push({
        hour: (item as { hour: string }).hour,
        location: loc === "home" ? "home" : "school",
      })
    }
  }
  return out
}

export function migrateWeeklySchedule(raw: unknown): WeeklySchedule {
  const empty: WeeklySchedule = {
    dimanche: [],
    lundi: [],
    mardi: [],
    mercredi: [],
    jeudi: [],
    vendredi: [],
    samedi: [],
  }
  if (!raw || typeof raw !== "object") return empty
  const obj = raw as Record<string, unknown>
  for (const day of dayKeys) {
    empty[day] = migrateDaySchedule(obj[day])
  }
  return empty
}
