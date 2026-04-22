"use client"

import { cn } from "@/lib/utils"
import { dayKeys, dayLabels, type DayKey, type WeeklySchedule } from "@/lib/types/schedule"
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

export function ScheduleGrid({
  value,
  onChange,
  timeRangeStart = "08:00",
  timeRangeEnd = "20:00",
}: ScheduleGridProps) {
  const hours = generateHours(timeRangeStart, timeRangeEnd)

  function toggleCell(day: DayKey, hour: string) {
    const current = value[day] || []
    const hasClass = current.includes(hour)
    const updated: WeeklySchedule = { ...value }
    if (hasClass) {
      updated[day] = current.filter((h) => h !== hour)
    } else {
      updated[day] = [...current, hour].sort()
    }
    onChange(updated)
  }

  function isClassHour(day: DayKey, hour: string): boolean {
    return (value[day] || []).includes(hour)
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[420px]">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `60px repeat(${dayKeys.length}, 1fr)` }}
        >
          {/* Header */}
          <div className="text-xs font-medium text-muted-foreground" />
          {dayKeys.map((day) => (
            <div key={day} className="text-center text-xs font-medium">
              {dayLabels[day]}
            </div>
          ))}

          {/* Grid rows */}
          {hours.map((hour) => (
            <React.Fragment key={`row-${hour}`}>
              <div className="flex items-center justify-end pr-1 text-xs text-muted-foreground">
                {hour}
              </div>
              {dayKeys.map((day) => {
                const hasClass = isClassHour(day, hour)
                return (
                  <button
                    key={`${day}-${hour}`}
                    type="button"
                    onClick={() => toggleCell(day, hour)}
                    className={cn(
                      "h-8 rounded-sm border transition-colors",
                      hasClass
                        ? "border-red-300 bg-red-200 hover:bg-red-300"
                        : "border-green-300 bg-green-100 hover:bg-green-200"
                    )}
                    aria-label={`${dayLabels[day]} ${hour} - ${hasClass ? "En cours" : "Disponible"}`}
                  />
                )
              })}
            </React.Fragment>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm border border-green-300 bg-green-100" />
            Disponible
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm border border-red-300 bg-red-200" />
            En cours
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Cliquez sur les cases pour indiquer vos heures de cours (en rouge).
        </p>
      </div>
    </div>
  )
}
