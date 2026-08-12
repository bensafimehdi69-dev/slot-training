"use client"

import { useEffect, useState } from "react"
import { AthleteFigure, GuardFigure, KickFigure } from "./athlete"
import { clampGauge, type Gauges } from "./data"
import {
  Battery,
  BigMessage,
  Cta,
  FactorBadge,
  Kicker,
  Narration,
  Panel,
  SceneTitle,
  TimelineChips,
  type SceneProps,
} from "./parts"
import styles from "./nutrition.module.css"

// ------------------------------------------------- 08:00 → 17:00 — l'école

const SCHOOL_STEPS: { time: string; icon: string; text: string; gauges: Gauges }[] = [
  {
    time: "08:00",
    icon: "🎒",
    text: "Départ pour l'école. La digestion travaille encore.",
    gauges: { energy: 72, fuel: 62, hydration: 60, recovery: 80 },
  },
  {
    time: "10:00",
    icon: "📚",
    text: "Cours de maths. Le cerveau consomme du glucose en continu.",
    gauges: { energy: 64, fuel: 58, hydration: 56, recovery: 80 },
  },
  {
    time: "12:00",
    icon: "🍽️",
    text: "Déjeuner à la cantine : le réservoir remonte un peu.",
    gauges: { energy: 68, fuel: 66, hydration: 62, recovery: 80 },
  },
  {
    time: "15:00",
    icon: "🧠",
    text: "Dernières heures de cours. Concentration, posture, température corporelle : tout consomme.",
    gauges: { energy: 58, fuel: 60, hydration: 54, recovery: 78 },
  },
  {
    time: "17:00",
    icon: "🥋",
    text: "Direction le centre d'entraînement.",
    gauges: { energy: 62, fuel: 55, hydration: 55, recovery: 75 },
  },
]

export function SchoolDayScene({ onAdvance, setGauges }: SceneProps) {
  const [step, setStep] = useState(0)
  const done = step >= SCHOOL_STEPS.length - 1

  useEffect(() => {
    if (done) return
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, SCHOOL_STEPS.length - 1)), 2000)
    return () => clearInterval(timer)
  }, [done])

  useEffect(() => {
    setGauges(SCHOOL_STEPS[step].gauges)
  }, [step, setGauges])

  const current = SCHOOL_STEPS[step]

  return (
    <>
      <Kicker>La journée continue</Kicker>
      <div className={styles.clock} key={current.time}>
        {current.time}
      </div>
      <TimelineChips steps={SCHOOL_STEPS.map((s) => ({ time: s.time }))} activeIndex={step} />
      <div className="flex flex-wrap items-center justify-center gap-8">
        <span className="text-6xl" key={current.icon}>
          <span className={styles.foodItem} style={{ display: "inline-block" }}>{current.icon}</span>
        </span>
        <Panel className="max-w-md">
          <p className="text-sm leading-relaxed text-slate-200" key={step}>
            {current.text}
          </p>
        </Panel>
      </div>
      <Narration>
        Regarde les jauges en haut de l&apos;écran : elles bougent alors qu&apos;il n&apos;a
        pas encore fait une seule minute de sport.
      </Narration>
      {done && (
        <>
          <BigMessage delay={styles.d1}>Dépense énergétique ≠ uniquement activité physique</BigMessage>
          <Cta onClick={onAdvance}>Entrer à l&apos;entraînement 🥋</Cta>
        </>
      )}
    </>
  )
}

// ------------------------------------------------------ 17:00 — Taekwondo

const TRAINING_PHASES = [
  "Échauffement",
  "Déplacements",
  "Techniques",
  "Pads",
  "Kicks explosifs",
  "Répétitions",
  "Sparring",
  "Prépa physique",
]

const TRAINING_START: Gauges = { energy: 62, fuel: 55, hydration: 55, recovery: 75 }
const TRAINING_END: Gauges = { energy: 32, fuel: 22, hydration: 30, recovery: 42 }

export function TrainingScene({ onAdvance, setGauges }: SceneProps) {
  const [beat, setBeat] = useState(0)
  const [phase, setPhase] = useState(0)

  // Beat 0 : la séance défile ; les jauges se vident au fil des phases.
  useEffect(() => {
    if (beat !== 0) return
    const timer = setInterval(() => {
      setPhase((p) => Math.min(p + 1, TRAINING_PHASES.length - 1))
    }, 1100)
    return () => clearInterval(timer)
  }, [beat])

  useEffect(() => {
    const t = phase / (TRAINING_PHASES.length - 1)
    setGauges({
      energy: clampGauge(TRAINING_START.energy + (TRAINING_END.energy - TRAINING_START.energy) * t),
      fuel: clampGauge(TRAINING_START.fuel + (TRAINING_END.fuel - TRAINING_START.fuel) * t),
      hydration: clampGauge(TRAINING_START.hydration + (TRAINING_END.hydration - TRAINING_START.hydration) * t),
      recovery: clampGauge(TRAINING_START.recovery + (TRAINING_END.recovery - TRAINING_START.recovery) * t),
    })
  }, [phase, setGauges])

  const kicking = phase >= 3

  return (
    <>
      <div className={styles.clockSmall}>17:00 — Centre d&apos;entraînement</div>
      <BigMessage>Training starts 🥋</BigMessage>

      {beat === 0 && (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {TRAINING_PHASES.map((p, i) => (
              <span
                key={p}
                className={`${styles.timeChip} ${i === phase ? styles.timeChipActive : i < phase ? styles.timeChipDone : ""}`}
              >
                {p}
              </span>
            ))}
          </div>
          <div className="relative">
            {kicking ? <KickFigure height={240} speedlines /> : <GuardFigure height={240} />}
            {phase >= 4 && (
              <>
                <span className={styles.sweat} style={{ top: "18%", left: "24%" }}>💧</span>
                <span className={styles.sweat} style={{ top: "14%", left: "38%", animationDelay: "0.6s" }}>💧</span>
              </>
            )}
          </div>
          {phase >= TRAINING_PHASES.length - 1 && (
            <Cta onClick={() => setBeat(1)}>Zoomer dans la cuisse 🔬</Cta>
          )}
        </>
      )}

      {beat === 1 && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-sky-300">
            <span>Zoom</span>
            <span>→</span>
            <span>Cuisse</span>
            <span>→</span>
            <span>Muscle</span>
            <span>→</span>
            <span>Glycogène</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <AthleteFigure height={260} xray highlight="glycogen" />
            <div className="flex flex-col items-center gap-4">
              <Battery label="Muscle glycogen" level={24} />
              <div className="flex flex-col gap-2">
                <FactorBadge icon="🔋" label="Fuel ↓" color="#4ade80" />
                <FactorBadge icon="💧" label="Hydration ↓" color="#38bdf8" delay={0.2} />
                <FactorBadge icon="⚡" label="Energy ↓" color="#fbbf24" delay={0.4} />
              </div>
            </div>
          </div>
          <Narration>
            À chaque échange intense, le muscle puise dans sa réserve de glycogène.
            Il transpire, l&apos;eau part. L&apos;énergie est utilisée.
          </Narration>
          <Cta onClick={() => setBeat(2)}>Continuer →</Cta>
        </>
      )}

      {beat === 2 && (
        <>
          <BigMessage delay={styles.d1}>Training requires fuel.</BigMessage>
          <BigMessage accent delay={styles.d2}>
            High-intensity performance requires energy availability.
          </BigMessage>
          <Cta onClick={onAdvance}>La question que tout le monde se pose →</Cta>
        </>
      )}
    </>
  )
}

// --------------------------------------- « Combien je dois courir pour ça ? »

export function BurnScene({ onAdvance }: SceneProps) {
  return (
    <>
      <Kicker>La vraie question</Kicker>
      <SceneTitle>
        « J&apos;ai mangé 3 croissants, 2 donuts et une boisson sucrée.
        Combien je dois courir pour dépenser ça ? »
      </SceneTitle>
      <Narration>
        On peut donner des ordres de grandeur pour matérialiser l&apos;énergie. Mais il
        n&apos;existe pas de tarif fixe du type « 1 donut = 25 minutes de course »,
        parce que la dépense dépend de toi :
      </Narration>
      <div className="flex flex-wrap justify-center gap-2">
        <FactorBadge icon="⚖️" label="Poids corporel" color="#38bdf8" />
        <FactorBadge icon="🔥" label="Intensité" color="#fbbf24" delay={0.12} />
        <FactorBadge icon="⏱️" label="Durée" color="#4ade80" delay={0.24} />
        <FactorBadge icon="🏃" label="Type d'activité" color="#f472b6" delay={0.36} />
        <FactorBadge icon="🧬" label="Ton organisme" color="#a78bfa" delay={0.48} />
      </div>
      <BigMessage accent delay={styles.d2}>
        You don&apos;t exercise to punish yourself for eating.
      </BigMessage>
      <Narration delay={styles.d3}>
        L&apos;exercice sert à t&apos;entraîner, progresser et performer —
        pas à « rembourser » ton alimentation.
      </Narration>
      <Cta onClick={onAdvance}>Rembobiner la journée ⏪</Cta>
    </>
  )
}
