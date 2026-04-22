import { Badge } from "@/components/ui/badge"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface TravelTimeBadgeProps {
  minutes: number
  className?: string
}

export function TravelTimeBadge({ minutes, className }: TravelTimeBadgeProps) {
  let colorClass = "bg-green-100 text-green-800 border-green-200"
  if (minutes > 60) {
    colorClass = "bg-red-100 text-red-800 border-red-200"
  } else if (minutes >= 30) {
    colorClass = "bg-yellow-100 text-yellow-800 border-yellow-200"
  }

  const display =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? `${(minutes % 60).toString().padStart(2, "0")}` : ""}`
      : `${minutes} min`

  return (
    <Badge variant="outline" className={cn(colorClass, className)}>
      <Clock className="mr-1 h-3 w-3" />
      {display}
    </Badge>
  )
}
