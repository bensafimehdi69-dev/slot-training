"use client"

import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import {
  dayKeys,
  type DayKey,
  type ScheduleSlot,
  type SlotLocation,
  type WeeklySchedule,
} from "@/lib/types/schedule"
import React from "react"

interface ScheduleGridProps {
  value: WeeklySchedule
  onChange: (schedule: WeeklySchedule) => void
  // Default to the athlete's full waking range (07h–22h) so they can mark
  // school hours that fall outside the campaign's training window. Callers
  // can override but generally shouldn't.
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
 * cycles a cell through Available → At school → At home → Available.
 *
 * The location on busy cells is fed into the optimiser so it knows where the
 * athlete is coming from (or going back to) when scheduling a training slot.
 */
export function ScheduleGrid({
  value,
  onChange,
  timeRangeStart = "07:00",
  timeRangeEnd = "22:00",
}: ScheduleGridProps) {
  const td = useTranslations("days")
  const ts = useTranslations("scheduleCells")
  const hours = generateHours(timeRangeStart, timeRangeEnd)

  const shortDayKey = (k: string) =>
    `short${k.charAt(0).toUpperCase()}${k.slice(1)}`

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
    if (state === "training") return ""
    return state === "school" ? ts("school") : ts("home")
  }

  function cellAriaState(state: CellState): string {
    if (state === "training") return ts("available")
    return state === "school" ? ts("atSchool") : ts("atHome")
  }

  return (
    <div>
      {/* Width-fitted: 32px hour column + 7 equal day columns. Cells 28px
          tall so 07h–22h all fit without scrolling on a phone. The athlete
          uses short cell text ("s" / "h") so the cell can stay narrow. */}
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `2rem repeat(${dayKeys.length}, minmax(0,1fr))` }}
      >
        <div className="text-[10px] font-medium text-muted-foreground" />
        {dayKeys.map((day) => (
          // 3-letter abbreviation so the 7 column headers don't run into
          // each other on a phone width.
          <div key={day} className="px-0.5 text-center text-[10px] font-medium">
            {td(shortDayKey(day))}
          </div>
        ))}

        {hours.map((hour) => (
          <React.Fragment key={`row-${hour}`}>
            <div className="flex items-center justify-end pr-1 text-[10px] text-muted-foreground">
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
                    // overflow-hidden + leading-none keeps "School" / "Maison"
                    // inside the 28px cell on a narrow phone — without it the
                    // descenders would push the word past the rounded corners.
                    "flex h-7 items-center justify-center overflow-hidden rounded-sm border px-0.5 text-[9px] font-medium leading-none transition-colors",
                    cellClass(state)
                  )}
                  aria-label={`${td(day)} ${hour} – ${cellAriaState(state)}`}
                >
                  <span className="truncate">{cellText(state)}</span>
                </button>
              )
            })}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm border border-green-300 bg-green-100" />
          {ts("available")}
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm border border-gray-300 bg-gray-200" />
          {ts("school")}
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm border border-gray-300 bg-gray-200" />
          {ts("home")}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {ts("tapHint")}
      </p>
    </div>
  )
}
