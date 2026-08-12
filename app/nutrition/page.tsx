import type { Metadata } from "next"
import { NutritionClient } from "./nutrition-client"

export const metadata: Metadata = {
  title: "Nutrition Lab — Smart Nutrition for Young Taekwondo Athletes",
  description:
    "Animation éducative interactive : entre dans le corps d'un jeune athlète de taekwondo pour comprendre l'énergie, le glycogène, l'hydratation, le poids et la performance.",
}

// Expérience pédagogique autonome, volontairement publique (pas de session
// requise) : un coach peut la projeter ou l'envoyer par lien à ses athlètes.
export default function NutritionPage() {
  return <NutritionClient />
}
