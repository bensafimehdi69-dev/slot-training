import { Badge } from "@/components/ui/badge"
import { Car, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface TravelModeBadgesProps {
  // Walking time is accepted in the props for backwards compatibility with
  // existing callers but is no longer displayed — Google's walking
  // estimates are unrealistic for far destinations (multi-hour walks for
  // 20+ km), so we only surface the driving time which is what athletes
  // actually use.
  walkingMinutes?: number
  drivingMinutes?: number
  // Legacy single-mode value used for older optimisations that predate the
  // mode split. Rendered as a single Clock badge so historical data stays
  // readable.
  fallbackMinutes?: number
  className?: string
}

function colourFor(minutes: number): string {
  if (minutes > 60) return "bg-red-100 text-red-800 border-red-200"
  if (minutes >= 30) return "bg-yellow-100 text-yellow-800 border-yellow-200"
  return "bg-green-100 text-green-800 border-green-200"
}

function format(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`
}

export function TravelModeBadges({
  drivingMinutes,
  fallbackMinutes,
  className,
}: TravelModeBadgesProps) {
  if (typeof drivingMinutes === "number") {
    return (
      <Badge
        variant="outline"
        className={cn(colourFor(drivingMinutes), className)}
        aria-label={`En voiture : ${format(drivingMinutes)}`}
      >
        <Car className="mr-1 h-3 w-3" />
        {format(drivingMinutes)}
      </Badge>
    )
  }

  if (typeof fallbackMinutes !== "number") return null
  return (
    <Badge
      variant="outline"
      className={cn(colourFor(fallbackMinutes), className)}
    >
      <Clock className="mr-1 h-3 w-3" />
      {format(fallbackMinutes)}
    </Badge>
  )
}
