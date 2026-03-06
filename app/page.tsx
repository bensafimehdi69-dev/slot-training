import { AppHeader } from "@/components/custom/app-header"
import { HeroSection } from "@/components/custom/hero-section"

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <AppHeader />
      <main className="container mx-auto px-4">
        <HeroSection />
      </main>
    </div>
  )
}
