"use client"

import { cn } from "@/lib/utils"
import type { ConstraintCell, ConstraintsGrid } from "@/lib/types/profile"
import React from "react"

const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
const HOURS = Array.from({ length: 16 }, (_, i) =>
  `${(i + 7).toString().padStart(2, "0")}:00`
)

const STATE_ORDER: ConstraintCell[] = ["training", "school", "home"]

interface AthleteAvailabilityGridProps {
  value: ConstraintsGrid
  onChange: (grid: ConstraintsGrid) => void
}

function createDefaultGrid(): ConstraintsGrid {
  return Array(7)
    .fill(null)
    .map(() => Array<ConstraintCell>(16).fill("training"))
}

function nextState(state: ConstraintCell): ConstraintCell {
  const idx = STATE_ORDER.indexOf(state)
  return STATE_ORDER[(idx + 1) % STATE_ORDER.length]
}

function cellClass(state: ConstraintCell): string {
  switch (state) {
    case "training":
      return "border-green-300 bg-green-200 hover:bg-green-300"
    case "school":
    case "home":
      return "border-gray-300 bg-gray-200 hover:bg-gray-300"
  }
}

function cellText(state: ConstraintCell): string {
  switch (state) {
    case "training":
      return ""
    case "school":
      return "school"
    case "home":
      return "home"
  }
}

function cellLabel(state: ConstraintCell): string {
  switch (state) {
    case "training":
      return "Disponible"
    case "school":
      return "À l'école"
    case "home":
      return "À la maison"
  }
}

/**
 * Three-state weekly grid for athlete availability. Each tap cycles through:
 * Disponible → À l'école → À la maison → Disponible.
 *
 * The location ("school" / "home") on busy cells is what the optimiser uses
 * to compute the trip from the actual previous location instead of inferring
 * it from the schedule shape.
 */
export function AthleteAvailabilityGrid({
  value,
  onChange,
}: AthleteAvailabilityGridProps) {
  const grid = value.length === 7 && value[0]?.length === 16 ? value : createDefaultGrid()

  function cycle(day: number, hour: number) {
    const newGrid = grid.map((row) => [...row])
    newGrid[day][hour] = nextState(grid[day][hour])
    onChange(newGrid)
  }

  return (
    <div className="overflow-x-auto">
      {/* Wider min-w + 44px cells in mobile so the 3-state cycle is taggable
          with a thumb. Hour column is sticky so it stays visible while the
          7 day columns scroll horizontally. */}
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-1">
          <div className="sticky left-0 z-10 bg-background text-xs font-medium text-muted-foreground" />
          {DAYS.map((day) => (
            <div key={day} className="text-center text-xs font-medium">
              {day}
            </div>
          ))}

          {HOURS.map((hour, hourIdx) => (
            <React.Fragment key={`row-${hour}`}>
              <div className="sticky left-0 z-10 flex items-center justify-end bg-background pr-1 text-xs text-muted-foreground">
                {hour}
              </div>
              {DAYS.map((_, dayIdx) => {
                const state = grid[dayIdx][hourIdx]
                return (
                  <button
                    key={`${dayIdx}-${hourIdx}`}
                    type="button"
                    onClick={() => cycle(dayIdx, hourIdx)}
                    aria-label={`${DAYS[dayIdx]} ${hour} – ${cellLabel(state)}`}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-sm border text-[10px] font-medium transition-colors sm:h-8",
                      cellClass(state)
                    )}
                  >
                    {cellText(state)}
                  </button>
                )
              })}
            </React.Fragment>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm border border-green-300 bg-green-200" />
            Disponible
          </div>
          <div className="flex items-center gap-1">
            <div className="flex h-3 w-3 items-center justify-center rounded-sm border border-gray-300 bg-gray-200 text-[7px] font-medium">
              s
            </div>
            À l&apos;école (school)
          </div>
          <div className="flex items-center gap-1">
            <div className="flex h-3 w-3 items-center justify-center rounded-sm border border-gray-300 bg-gray-200 text-[7px] font-medium">
              h
            </div>
            À la maison (home)
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Touchez une case pour cycler entre les 3 états. Indiquer "school" ou
          "home" sur les heures occupées permet à l&apos;optimiseur de calculer
          votre temps de trajet exact vers l&apos;entraînement.
        </p>
      </div>
    </div>
  )
}
