"use client"

import { useEffect, useState } from "react"
import { COMPARE_BREAKFASTS, COMPARE_MACROS, COMPARE_TIMELINE } from "./data"
import {
  BigMessage,
  Cta,
  FoodRow,
  GaugeStack,
  Kicker,
  Narration,
  Panel,
  SceneTitle,
  TimelineChips,
  type SceneProps,
} from "./parts"
import styles from "./nutrition.module.css"

// Deux versions exactement identiques du même athlète, deux compositions de
// journée. On ne colle pas d'étiquette « bon / mauvais » : on regarde ce que
// chaque stratégie apporte, heure par heure.

export function CompareScene({ onAdvance }: SceneProps) {
  const [beat, setBeat] = useState<"rewind" | "setup" | "play" | "verdict">("rewind")
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (beat !== "rewind") return
    const timer = setTimeout(() => setBeat("setup"), 1600)
    return () => clearTimeout(timer)
  }, [beat])

  useEffect(() => {
    if (beat !== "play") return
    if (step >= COMPARE_TIMELINE.length - 1) {
      const timer = setTimeout(() => setBeat("verdict"), 1200)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => setStep((s) => s + 1), 1700)
    return () => clearTimeout(timer)
  }, [beat, step])

  if (beat === "rewind") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className={styles.rewindOverlay}>⏪ REWIND</div>
        <Narration>Retour à 08:00. Même athlète, même journée, même entraînement.</Narration>
      </div>
    )
  }

  const current = COMPARE_TIMELINE[Math.min(step, COMPARE_TIMELINE.length - 1)]

  return (
    <>
      <Kicker>Rewind ⏪ — retour à 08:00</Kicker>
      <SceneTitle>Deux stratégies, même athlète</SceneTitle>

      <div className={styles.split}>
        <Panel>
          <p className="mb-2 text-center text-xs font-black uppercase tracking-widest text-rose-300">
            {COMPARE_BREAKFASTS.a.name}
          </p>
          <FoodRow foods={COMPARE_BREAKFASTS.a.foods} />
          {(beat === "play" || beat === "verdict") && (
            <div className="mt-4">
              <GaugeStack gauges={current.a} />
            </div>
          )}
        </Panel>
        <Panel>
          <p className="mb-2 text-center text-xs font-black uppercase tracking-widest text-emerald-300">
            {COMPARE_BREAKFASTS.b.name}
          </p>
          <FoodRow foods={COMPARE_BREAKFASTS.b.foods} />
          {(beat === "play" || beat === "verdict") && (
            <div className="mt-4">
              <GaugeStack gauges={current.b} />
            </div>
          )}
        </Panel>
      </div>

      {beat === "setup" && (
        <>
          <Panel className="w-full max-w-2xl">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-slate-300">
              Ce que chaque petit-déjeuner apporte
            </p>
            <div className="flex flex-col gap-2">
              {COMPARE_MACROS.map((row) => (
                <div key={row.label} className="grid grid-cols-[6.5rem_1fr_1fr] items-center gap-2">
                  <span className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-300">
                    {row.label}
                  </span>
                  <div className={styles.compareBar}>
                    <div
                      className={styles.compareFill}
                      style={{ width: `${row.a}%`, background: "#fb7185" }}
                    />
                  </div>
                  <div className={styles.compareBar}>
                    <div
                      className={styles.compareFill}
                      style={{ width: `${row.b}%`, background: "#34d399" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Narration>
            Beaucoup d&apos;énergie des deux côtés — mais pas les mêmes protéines, fibres,
            micronutriments ni la même hydratation. Lance la journée et observe.
          </Narration>
          <Cta onClick={() => setBeat("play")}>PLAY ▶</Cta>
        </>
      )}

      {(beat === "play" || beat === "verdict") && (
        <TimelineChips
          steps={COMPARE_TIMELINE.map((s) => ({ time: s.time, label: s.label }))}
          activeIndex={step}
        />
      )}

      {beat === "verdict" && (
        <>
          <BigMessage delay={styles.d1}>Same athlete. Same training. Different fuel.</BigMessage>
          <Narration delay={styles.d2}>
            Aucun aliment n&apos;a été « interdit ». Mais la composition et
            l&apos;organisation de l&apos;alimentation sur <strong>l&apos;ensemble de la journée</strong>{" "}changent ce que l&apos;athlète a dans le réservoir à 17h — et ce qu&apos;il
            lui reste pour récupérer la nuit.
          </Narration>
          <Cta onClick={onAdvance}>Le lendemain matin ⚖️</Cta>
        </>
      )}
    </>
  )
}
