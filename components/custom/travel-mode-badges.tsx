import { Badge } from "@/components/ui/badge"
import { Car, Footprints, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface TravelModeBadgesProps {
  walkingMinutes?: number
  drivingMinutes?: number
  // Legacy single-mode value used for older optimisations that predate the
  // walking/driving split. If walkingMinutes/drivingMinutes are unset, this
  // renders as a single Clock badge so the historical data stays readable.
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

/**
 * Side-by-side walking + driving travel pills. Falls back to a single
 * Clock badge when only legacy `fallbackMinutes` is available.
 */
export function TravelModeBadges({
  walkingMinutes,
  drivingMinutes,
  fallbackMinutes,
  className,
}: TravelModeBadgesProps) {
  const hasPair =
    typeof walkingMinutes === "number" && typeof drivingMinutes === "number"

  if (!hasPair) {
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

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Badge
        variant="outline"
        className={colourFor(walkingMinutes!)}
        aria-label={`À pied : ${format(walkingMinutes!)}`}
      >
        <Footprints className="mr-1 h-3 w-3" />
        {format(walkingMinutes!)}
      </Badge>
      <Badge
        variant="outline"
        className={colourFor(drivingMinutes!)}
        aria-label={`En voiture : ${format(drivingMinutes!)}`}
      >
        <Car className="mr-1 h-3 w-3" />
        {format(drivingMinutes!)}
      </Badge>
    </span>
  )
}
