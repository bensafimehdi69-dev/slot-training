"use client"

import { cn } from "@/lib/utils"
import {
  dayKeys,
  dayLabels,
  type DayKey,
  type ScheduleSlot,
  type SlotLocation,
  type WeeklySchedule,
} from "@/lib/types/schedule"
import React from "react"

interface ScheduleGridProps {
  value: WeeklySchedule
  onChange: (schedule: WeeklySchedule) => void
  timeRangeStart?: string
  timeRangeEnd?: string
}

function generateHours(start: string, end: string): string[] {
  const startHour = parseInt(start.split(":")[0], 10)
  const endHour = parseInt(end.split(":")[0], 10)
  const hours: string[] = []
  for (let h = startHour; h < endHour; h++) {
    hours.push(`${h.toString().padStart(2, "0")}:00`)
  }
  return hours
}

type CellState = "training" | SlotLocation
const CYCLE: CellState[] = ["training", "school", "home"]
function nextState(state: CellState): CellState {
  return CYCLE[(CYCLE.indexOf(state) + 1) % CYCLE.length]
}

/**
 * Three-state weekly schedule for an athlete's campaign response. Each tap
 * cycles a cell through Disponible → À l'école → À la maison → Disponible.
 *
 * The location on busy cells is fed into the optimiser so it knows where the
 * athlete is coming from (or going back to) when scheduling a training slot.
 */
export function ScheduleGrid({
  value,
  onChange,
  timeRangeStart = "08:00",
  timeRangeEnd = "20:00",
}: ScheduleGridProps) {
  const hours = generateHours(timeRangeStart, timeRangeEnd)

  function cellStateFor(day: DayKey, hour: string): CellState {
    const slot = (value[day] || []).find((s) => s.hour === hour)
    return slot ? slot.location : "training"
  }

  function cycle(day: DayKey, hour: string) {
    const current = cellStateFor(day, hour)
    const next = nextState(current)
    const dayList = value[day] || []
    let updatedDay: ScheduleSlot[]
    if (next === "training") {
      updatedDay = dayList.filter((s) => s.hour !== hour)
    } else if (current === "training") {
      updatedDay = [...dayList, { hour, location: next }].sort((a, b) =>
        a.hour.localeCompare(b.hour)
      )
    } else {
      updatedDay = dayList.map((s) =>
        s.hour === hour ? { hour, location: next } : s
      )
    }
    onChange({ ...value, [day]: updatedDay })
  }

  function cellClass(state: CellState): string {
    if (state === "training") {
      return "border-green-300 bg-green-100 hover:bg-green-200"
    }
    return "border-gray-300 bg-gray-200 hover:bg-gray-300"
  }

  function cellText(state: CellState): string {
    return state === "training" ? "" : state
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[420px]">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `60px repeat(${dayKeys.length}, 1fr)` }}
        >
          <div className="text-xs font-medium text-muted-foreground" />
          {dayKeys.map((day) => (
            <div key={day} className="text-center text-xs font-medium">
              {dayLabels[day]}
            </div>
          ))}

          {hours.map((hour) => (
            <React.Fragment key={`row-${hour}`}>
              <div className="flex items-center justify-end pr-1 text-xs text-muted-foreground">
                {hour}
              </div>
              {dayKeys.map((day) => {
                const state = cellStateFor(day, hour)
                return (
                  <button
                    key={`${day}-${hour}`}
                    type="button"
                    onClick={() => cycle(day, hour)}
                    className={cn(
                      "flex h-8 items-center justify-center rounded-sm border text-[10px] font-medium transition-colors",
                      cellClass(state)
                    )}
                    aria-label={`${dayLabels[day]} ${hour} – ${state === "training" ? "Disponible" : state === "school" ? "À l'école" : "À la maison"}`}
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
            <div className="h-3 w-3 rounded-sm border border-green-300 bg-green-100" />
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
          Touchez une case pour cycler entre 3 états : Disponible → À l&apos;école
          → À la maison. Indiquer où vous êtes pendant les heures occupées
          permet à l&apos;optimiseur de calculer votre vrai temps de trajet.
        </p>
      </div>
    </div>
  )
}
