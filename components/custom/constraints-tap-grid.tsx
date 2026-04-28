"use client"

import { cn } from "@/lib/utils"
import React from "react"

const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
const HOURS = Array.from({ length: 16 }, (_, i) =>
  `${(i + 7).toString().padStart(2, "0")}:00`
)

interface ConstraintsTapGridProps {
  value: boolean[][]
  onChange: (grid: boolean[][]) => void
}

function createDefaultGrid(): boolean[][] {
  return Array(7)
    .fill(null)
    .map(() => Array(16).fill(true))
}

export function ConstraintsTapGrid({
  value,
  onChange,
}: ConstraintsTapGridProps) {
  const grid = value.length === 7 && value[0]?.length === 16 ? value : createDefaultGrid()

  function toggle(day: number, hour: number) {
    const newGrid = grid.map((row) => [...row])
    newGrid[day][hour] = !newGrid[day][hour]
    onChange(newGrid)
  }

  return (
    <div>
      {/* The grid fits the viewport width: 32px hour column + 7 equal day
          columns. Cells are 28px tall so the full 07h–22h range stays visible
          on a phone without vertical scroll inside the dialog. Smaller than
          the 44px iOS target — accepted trade-off so the manager sees all
          days at once. */}
      <div className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] gap-0.5">
        <div className="text-[10px] font-medium text-muted-foreground" />
        {DAYS.map((day) => (
          <div key={day} className="text-center text-[10px] font-medium">
            {day}
          </div>
        ))}

        {HOURS.map((hour, hourIdx) => (
          <React.Fragment key={`row-${hour}`}>
            <div className="flex items-center justify-end pr-1 text-[10px] text-muted-foreground">
              {hour}
            </div>
            {DAYS.map((_, dayIdx) => (
              <button
                key={`${dayIdx}-${hourIdx}`}
                type="button"
                onClick={() => toggle(dayIdx, hourIdx)}
                className={cn(
                  "h-7 rounded-sm border transition-colors",
                  grid[dayIdx][hourIdx]
                    ? "border-green-300 bg-green-200 hover:bg-green-300"
                    : "border-gray-200 bg-gray-100 hover:bg-gray-200"
                )}
              />
            ))}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm border border-green-300 bg-green-200" />
          Disponible
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm border border-gray-200 bg-gray-100" />
          Indisponible
        </div>
      </div>
    </div>
  )
}
