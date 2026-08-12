"use client"

import { useState } from "react"
import {
  applyEffects,
  GAME_EVENTS,
  GAME_START,
  type GameOption,
  type Gauges,
} from "./data"
import {
  BigMessage,
  Cta,
  GaugeStack,
  Kicker,
  Narration,
  Panel,
  SceneTitle,
  TimelineChips,
  type SceneProps,
} from "./parts"
import styles from "./nutrition.module.css"

// Le jeune devient acteur : il construit sa journée à deux entraînements.
// Les séances consomment un montant fixe — c'est la stratégie alimentaire
// autour qui fait l'écart. On récompense la stratégie qui répond aux besoins
// de la journée, jamais « l'aliment le moins calorique ».

type Phase = "brief" | "play" | "result"

export function GameScene({ onAdvance, setGauges }: SceneProps) {
  const [phase, setPhase] = useState<Phase>("brief")
  const [eventIndex, setEventIndex] = useState(0)
  const [gauges, setLocalGauges] = useState<Gauges>(GAME_START)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [trainingDone, setTrainingDone] = useState(false)
  const [fuelBeforeT2, setFuelBeforeT2] = useState<number | null>(null)

  const updateGauges = (next: Gauges) => {
    setLocalGauges(next)
    setGauges(next)
  }

  const resetGame = () => {
    setPhase("brief")
    setEventIndex(0)
    setFeedback(null)
    setTrainingDone(false)
    setFuelBeforeT2(null)
    updateGauges(GAME_START)
  }

  const nextEvent = () => {
    setFeedback(null)
    setTrainingDone(false)
    if (eventIndex >= GAME_EVENTS.length - 1) {
      setPhase("result")
    } else {
      setEventIndex(eventIndex + 1)
    }
  }

  const pickOption = (option: GameOption) => {
    updateGauges(applyEffects(gauges, option.effects))
    setFeedback(option.note)
  }

  const runTraining = (drain: Gauges, isSecond: boolean) => {
    if (isSecond) setFuelBeforeT2(gauges.fuel)
    updateGauges(applyEffects(gauges, drain, -1))
    setTrainingDone(true)
  }

  // ------------------------------------------------------------------ brief

  if (phase === "brief") {
    return (
      <>
        <Kicker>À toi de jouer</Kicker>
        <BigMessage>Tomorrow</BigMessage>
        <BigMessage accent delay={styles.d1}>2 taekwondo training sessions</BigMessage>
        <div className="flex flex-wrap justify-center gap-3">
          <Panel glow>
            <p className="text-center text-sm font-bold text-slate-100">10:00 — Training #1 🥋</p>
          </Panel>
          <Panel glow>
            <p className="text-center text-sm font-bold text-slate-100">17:00 — Training #2 🥋</p>
          </Panel>
        </div>
        <Narration delay={styles.d2}>
          Petit-déjeuner, collations, repas, récupération, hydratation : à chaque
          décision, ton athlète évolue. Objectif : arriver à la fin de la journée avec
          les quatre jauges au vert — pas avec l&apos;assiette la plus vide.
        </Narration>
        <Cta onClick={() => setPhase("play")}>BUILD YOUR DAY ▶</Cta>
      </>
    )
  }

  // ----------------------------------------------------------------- result

  if (phase === "result") {
    const avg = (gauges.energy + gauges.fuel + gauges.hydration + gauges.recovery) / 4
    const verdict =
      avg >= 70
        ? "READY TO PERFORM 🥇"
        : avg >= 50
          ? "STRATÉGIE CORRECTE — AJUSTABLE 🥈"
          : "RÉSERVOIR VIDE — À REVOIR 🔧"

    const tips: string[] = []
    if (fuelBeforeT2 !== null) {
      tips.push(
        fuelBeforeT2 >= 45
          ? "✅ Tu es arrivé à la séance de 17h avec du carburant : c'est exactement ça, l'energy availability."
          : "⚠️ Tu es arrivé à la séance de 17h avec un réservoir presque vide : le déjeuner et la collation de 16h servent d'abord à préparer ce moment."
      )
    }
    tips.push(
      gauges.hydration >= 50
        ? "✅ Hydratation gérée sur la journée entière — pas seulement pendant l'effort."
        : "⚠️ La soif arrive toujours en retard : bois régulièrement, du matin au soir, surtout un jour à deux séances."
    )
    tips.push(
      gauges.recovery >= 55
        ? "✅ Tu as donné à ton corps de quoi réparer après l'effort : la progression se joue là."
        : "⚠️ Après une grosse séance, la fenêtre de récupération n'attend pas : glucides + protéines + eau dans l'heure."
    )

    return (
      <>
        <Kicker>Fin de journée — 22:30</Kicker>
        <BigMessage>{verdict}</BigMessage>
        <Panel glow className="w-full max-w-md">
          <GaugeStack gauges={gauges} />
        </Panel>
        <div className="flex max-w-xl flex-col gap-2">
          {tips.map((tip, i) => (
            <Panel key={i} className={styles.fadeUp} style={{ animationDelay: `${0.2 + i * 0.2}s` }}>
              <p className="text-sm leading-relaxed text-slate-200">{tip}</p>
            </Panel>
          ))}
        </div>
        <Narration delay={styles.d3}>
          Il n&apos;y avait pas une seule bonne réponse — il y avait une journée
          d&apos;entraînement à alimenter.
        </Narration>
        <div className="flex flex-wrap justify-center gap-3">
          <Cta ghost onClick={resetGame}>↺ Rejouer la journée</Cta>
          <Cta onClick={onAdvance}>Le message final →</Cta>
        </div>
      </>
    )
  }

  // ------------------------------------------------------------------- play

  const event = GAME_EVENTS[eventIndex]

  return (
    <>
      <Kicker>Build your day</Kicker>
      <TimelineChips
        steps={GAME_EVENTS.map((e) => ({ time: e.time.length > 5 ? "💧" : e.time }))}
        activeIndex={eventIndex}
      />
      <div className={styles.clockSmall}>
        {event.time} — {event.title}
      </div>

      {event.kind === "training" && event.drain && (
        <>
          {!trainingDone ? (
            <>
              <Narration>
                La séance va puiser dans les réserves : c&apos;est son rôle.
                Voyons ce qu&apos;il y a dans le réservoir.
              </Narration>
              <Cta onClick={() => runTraining(event.drain!, event.time === "17:00")}>
                Lancer la séance 🥋
              </Cta>
            </>
          ) : (
            <>
              <div className={`${styles.impactFlash} flex flex-wrap justify-center gap-2 text-sm font-bold uppercase tracking-widest`}>
                <span style={{ color: "#fbbf24" }}>⚡ Energy ↓</span>
                <span style={{ color: "#4ade80" }}>🔋 Fuel ↓</span>
                <span style={{ color: "#38bdf8" }}>💧 Hydration ↓</span>
                <span style={{ color: "#a78bfa" }}>🔧 Recovery ↓</span>
              </div>
              <Panel glow className="w-full max-w-md">
                <GaugeStack gauges={gauges} />
              </Panel>
              <Cta onClick={nextEvent}>Continuer →</Cta>
            </>
          )}
        </>
      )}

      {event.kind === "choice" && event.slot && (
        <>
          {feedback === null ? (
            <>
              <SceneTitle>{event.slot.question}</SceneTitle>
              <div className={styles.panelGrid} style={{ maxWidth: "56rem" }}>
                {event.slot.options.map((option) => (
                  <button
                    key={option.name}
                    type="button"
                    className={styles.optionCard}
                    onClick={() => pickOption(option)}
                  >
                    <span className={styles.optionFoods}>{option.foods}</span>
                    <span className={styles.optionName}>{option.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <Panel glow className="w-full max-w-md">
                <GaugeStack gauges={gauges} />
              </Panel>
              <Panel className="max-w-xl">
                <p className="text-sm leading-relaxed text-slate-200">{feedback}</p>
              </Panel>
              <Cta onClick={nextEvent}>Continuer →</Cta>
            </>
          )}
        </>
      )}
    </>
  )
}
