"use client"

import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { dayKeys } from "@/lib/types/schedule"
import type { ConstraintCell, ConstraintsGrid } from "@/lib/types/profile"
import React from "react"

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

/**
 * Three-state weekly grid for athlete availability. Each tap cycles through:
 * Available → At school → At home → Available.
 *
 * The location ("school" / "home") on busy cells is what the optimiser uses
 * to compute the trip from the actual previous location instead of inferring
 * it from the schedule shape.
 */
export function AthleteAvailabilityGrid({
  value,
  onChange,
}: AthleteAvailabilityGridProps) {
  const td = useTranslations("days")
  const ts = useTranslations("scheduleCells")
  const grid = value.length === 7 && value[0]?.length === 16 ? value : createDefaultGrid()

  const shortDayKey = (k: string) =>
    `short${k.charAt(0).toUpperCase()}${k.slice(1)}`

  function cellText(state: ConstraintCell): string {
    switch (state) {
      case "training":
        return ""
      case "school":
        return ts("schoolShort")
      case "home":
        return ts("homeShort")
    }
  }

  function cellLabel(state: ConstraintCell): string {
    switch (state) {
      case "training":
        return ts("available")
      case "school":
        return ts("atSchool")
      case "home":
        return ts("atHome")
    }
  }

  function cycle(day: number, hour: number) {
    const newGrid = grid.map((row) => [...row])
    newGrid[day][hour] = nextState(grid[day][hour])
    onChange(newGrid)
  }

  return (
    <div>
      {/* Width-fitted grid: 32px hour column + 7 equal day columns, no
          horizontal scroll. Cells are 28px tall — smaller than iOS's 44px
          recommendation but the trade-off is intentional so all 7 days +
          16 hours fit without scrolling. */}
      <div className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-0.5">
        <div className="text-[10px] font-medium text-muted-foreground" />
        {dayKeys.map((day) => (
          <div key={day} className="text-center text-[10px] font-medium">
            {td(shortDayKey(day))}
          </div>
        ))}

        {HOURS.map((hour, hourIdx) => (
          <React.Fragment key={`row-${hour}`}>
            <div className="flex items-center justify-end pr-1 text-[10px] text-muted-foreground">
              {hour}
            </div>
            {dayKeys.map((day, dayIdx) => {
              const state = grid[dayIdx][hourIdx]
              return (
                <button
                  key={`${dayIdx}-${hourIdx}`}
                  type="button"
                  onClick={() => cycle(dayIdx, hourIdx)}
                  aria-label={`${td(shortDayKey(day))} ${hour} – ${cellLabel(state)}`}
                  className={cn(
                    "flex h-7 items-center justify-center rounded-sm border text-[9px] font-medium transition-colors",
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

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm border border-green-300 bg-green-200" />
          {ts("available")}
        </div>
        <div className="flex items-center gap-1">
          <div className="flex h-3 w-3 items-center justify-center rounded-sm border border-gray-300 bg-gray-200 text-[7px] font-medium">
            {ts("schoolShort")}
          </div>
          {ts("school")}
        </div>
        <div className="flex items-center gap-1">
          <div className="flex h-3 w-3 items-center justify-center rounded-sm border border-gray-300 bg-gray-200 text-[7px] font-medium">
            {ts("homeShort")}
          </div>
          {ts("home")}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {ts("tapHint")}
      </p>
    </div>
  )
}
