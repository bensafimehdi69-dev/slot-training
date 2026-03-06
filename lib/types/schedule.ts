export type DayKey = "lundi" | "mardi" | "mercredi" | "jeudi" | "vendredi"

export const dayLabels: Record<DayKey, string> = {
  lundi: "Lundi",
  mardi: "Mardi",
  mercredi: "Mercredi",
  jeudi: "Jeudi",
  vendredi: "Vendredi",
}

export const dayKeys: DayKey[] = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"]

export type DaySchedule = string[]
export type WeeklySchedule = Record<DayKey, DaySchedule>
