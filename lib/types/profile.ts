import type { AddressWithCoords } from "./address"

// Per-hour availability cell for an athlete's weekly grid:
// - "training": athlete is free for this hour, can come to training.
// - "school": athlete is busy AT school (used as the departure location if a
//   training slot starts right after).
// - "home": athlete is busy AT home (used as the departure location if a
//   training slot starts right after).
export type ConstraintCell = "training" | "school" | "home"
export type ConstraintsGrid = ConstraintCell[][]

// Backwards-compat helper: turn a legacy boolean[][] (true = available) into
// the three-state grid. Pre-Lot-4 profiles default unavailable cells to
// "school" because most athletes mark school hours as their indispos.
export function migrateConstraintsGrid(
  raw: unknown,
  rows = 7,
  cols = 16
): ConstraintsGrid {
  const fallback = (): ConstraintsGrid =>
    Array.from({ length: rows }, () => Array<ConstraintCell>(cols).fill("training"))

  if (!Array.isArray(raw)) return fallback()
  const out: ConstraintsGrid = []
  for (let r = 0; r < rows; r++) {
    const row = raw[r]
    if (!Array.isArray(row)) {
      out.push(Array<ConstraintCell>(cols).fill("training"))
      continue
    }
    const newRow: ConstraintCell[] = []
    for (let c = 0; c < cols; c++) {
      const cell = row[c]
      if (cell === "training" || cell === "school" || cell === "home") {
        newRow.push(cell)
      } else if (typeof cell === "boolean") {
        newRow.push(cell ? "training" : "school")
      } else {
        newRow.push("training")
      }
    }
    out.push(newRow)
  }
  return out
}

export interface AthleteProfile {
  homeAddress: AddressWithCoords | null
  schoolAddress: AddressWithCoords | null
  clubAddress: AddressWithCoords | null
  constraintsGrid: ConstraintsGrid
  updatedAt: Date
}
