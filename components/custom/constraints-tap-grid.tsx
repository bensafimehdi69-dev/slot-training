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
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        <div className="grid grid-cols-8 gap-1">
          {/* Header */}
          <div className="text-xs font-medium text-muted-foreground" />
          {DAYS.map((day) => (
            <div key={day} className="text-center text-xs font-medium">
              {day}
            </div>
          ))}

          {/* Grid rows */}
          {HOURS.map((hour, hourIdx) => (
            <React.Fragment key={`row-${hour}`}>
              <div className="flex items-center justify-end pr-1 text-xs text-muted-foreground">
                {hour}
              </div>
              {DAYS.map((_, dayIdx) => (
                <button
                  key={`${dayIdx}-${hourIdx}`}
                  type="button"
                  onClick={() => toggle(dayIdx, hourIdx)}
                  className={cn(
                    "h-8 rounded-sm border transition-colors",
                    grid[dayIdx][hourIdx]
                      ? "border-green-300 bg-green-200 hover:bg-green-300"
                      : "border-gray-200 bg-gray-100 hover:bg-gray-200"
                  )}
                />
              ))}
            </React.Fragment>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
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
    </div>
  )
}
