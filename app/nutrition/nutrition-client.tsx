"use client"

import { useCallback, useEffect, useState } from "react"
import { SCENES, type Gauges } from "./data"
import { Hud, type SceneProps } from "./parts"
import { BreakfastScene, DestinationsScene, DigestionScene, IntroScene } from "./scenes-morning"
import { BurnScene, SchoolDayScene, TrainingScene } from "./scenes-day"
import { CompareScene } from "./scenes-compare"
import { GlycogenScene, MakingWeightScene, ScaleScene, WaterScene } from "./scenes-weight"
import { GameScene } from "./scenes-game"
import { FinaleScene } from "./scenes-final"
import styles from "./nutrition.module.css"

// Lecteur de l'épisode : une state machine de scènes + le HUD persistant.
// Chaque scène reçoit le contrôle des jauges pour animer sa propre timeline.

const SCENE_COMPONENTS: Record<string, (props: SceneProps) => React.ReactNode> = {
  intro: IntroScene,
  breakfast: BreakfastScene,
  digestion: DigestionScene,
  destinations: DestinationsScene,
  schoolday: SchoolDayScene,
  training: TrainingScene,
  burn: BurnScene,
  compare: CompareScene,
  scale: ScaleScene,
  water: WaterScene,
  glycogen: GlycogenScene,
  makingweight: MakingWeightScene,
  buildyourday: GameScene,
  finale: FinaleScene,
}

export function NutritionClient() {
  const [index, setIndex] = useState(0)
  const [gauges, setGauges] = useState<Gauges>(SCENES[0].gauges)

  const scene = SCENES[index]

  const goTo = useCallback((next: number) => {
    setIndex(() => {
      const clamped = Math.max(0, Math.min(SCENES.length - 1, next))
      setGauges(SCENES[clamped].gauges)
      return clamped
    })
  }, [])

  const onAdvance = useCallback(() => goTo(index + 1), [goTo, index])
  const onRestart = useCallback(() => goTo(0), [goTo])
  const updateGauges = useCallback((next: Gauges) => setGauges(next), [])

  // Navigation clavier — pratique en salle, vidéoprojecteur + télécommande.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return
      if (e.key === "ArrowRight") goTo(index + 1)
      if (e.key === "ArrowLeft") goTo(index - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goTo, index])

  const SceneComponent = SCENE_COMPONENTS[scene.id]

  return (
    <main className={styles.stage}>
      <div className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandTitle}>NUTRITION LAB 🥋</span>
          <span className={styles.brandSub}>Inside my body — Épisode 1</span>
        </div>
        <Hud gauges={gauges} hidden={scene.hideHud} />
      </div>

      <div className={styles.sceneArea}>
        <div className={styles.sceneScroll} key={scene.id}>
          <SceneComponent onAdvance={onAdvance} onRestart={onRestart} setGauges={updateGauges} />
        </div>
      </div>

      <div className={styles.bottomBar}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label="Chapitre précédent"
        >
          ←
        </button>
        <div className={styles.chapterInfo}>
          <span className={styles.chapterLabel}>
            {scene.chapter} · {scene.title} — {index + 1}/{SCENES.length}
          </span>
          <div className={styles.dots}>
            {SCENES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.dot} ${i === index ? styles.dotActive : i < index ? styles.dotDone : ""}`}
                onClick={() => goTo(i)}
                aria-label={`Chapitre ${i + 1} : ${s.title}`}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => goTo(index + 1)}
          disabled={index === SCENES.length - 1}
          aria-label="Chapitre suivant"
        >
          →
        </button>
      </div>
    </main>
  )
}
