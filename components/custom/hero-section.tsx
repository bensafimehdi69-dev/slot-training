import { Button } from "@/components/ui/button"
import { Clock, MapPin, Users, Zap } from "lucide-react"
import Link from "next/link"

export function HeroSection() {
  return (
    <div className="flex flex-col items-center gap-12 py-20 text-center">
      <div className="max-w-3xl space-y-6">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Planifiez vos entraînements{" "}
          <span className="text-blue-600">intelligemment</span>
        </h1>
        <p className="text-lg text-muted-foreground">
          Slot Training collecte les contraintes de vos athlètes, calcule les temps de trajet réels
          et optimise automatiquement le meilleur créneau collectif.
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/register">
            <Button size="lg">Commencer gratuitement</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 max-w-4xl">
        <Feature
          icon={<Users className="h-8 w-8 text-blue-600" />}
          title="Collecte unique"
          description="Un seul lien pour recueillir toutes les contraintes de vos athlètes."
        />
        <Feature
          icon={<MapPin className="h-8 w-8 text-blue-600" />}
          title="Trajets réels"
          description="Temps de trajet calculés via Google Maps, pas des estimations."
        />
        <Feature
          icon={<Zap className="h-8 w-8 text-blue-600" />}
          title="Optimisation auto"
          description="Le meilleur créneau collectif trouvé en quelques secondes."
        />
        <Feature
          icon={<Clock className="h-8 w-8 text-blue-600" />}
          title="Gain de temps"
          description="De 3 heures de coordination à moins de 15 minutes."
        />
      </div>
    </div>
  )
}

function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border p-6">
      {icon}
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
