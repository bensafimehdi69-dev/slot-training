"use client"

import { useEffect, useState } from "react"
import { GuardFigure, KickFigure } from "./athlete"
import { BigMessage, Cta, Kicker, Narration, type SceneProps } from "./parts"
import styles from "./nutrition.module.css"

const RITUAL = [
  { icon: "🥋", text: "Il met son dobok." },
  { icon: "🟥", text: "Il attache sa ceinture." },
  { icon: "🛡️", text: "Il met ses protections." },
  { icon: "🚪", text: "Il entre sur l'aire de combat." },
]

const MESSAGES = [
  "Food is fuel.",
  "Fuel supports training.",
  "Training requires recovery.",
  "Body weight is more than body fat.",
  "Don't fight against your body.",
]

export function FinaleScene({ onRestart }: SceneProps) {
  const [beat, setBeat] = useState(0)
  const [showCard, setShowCard] = useState(false)

  // Beat 2 : impact figé, puis le carton final apparaît.
  useEffect(() => {
    if (beat !== 2) return
    const timer = setTimeout(() => setShowCard(true), 1100)
    return () => clearTimeout(timer)
  }, [beat])

  return (
    <>
      {beat === 0 && (
        <>
          <Kicker>Retour au centre d&apos;entraînement</Kicker>
          <GuardFigure height={230} />
          <div className="flex flex-col items-center gap-2">
            {RITUAL.map((item, i) => (
              <div
                key={item.text}
                className={`${styles.fadeUp} flex items-center gap-3 text-sm font-semibold text-slate-100`}
                style={{ animationDelay: `${0.3 + i * 0.55}s` }}
              >
                <span className="text-xl">{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>
          <Cta onClick={() => setBeat(1)}>Face au combat →</Cta>
        </>
      )}

      {beat === 1 && (
        <>
          <div className="flex flex-col items-center gap-4 py-4">
            {MESSAGES.map((msg, i) => (
              <BigMessage key={msg} accent={i === MESSAGES.length - 1} delay={styles[`d${i + 1}` as keyof typeof styles] as string}>
                {msg}
              </BigMessage>
            ))}
          </div>
          <Cta onClick={() => setBeat(2)}>Déclencher la combinaison 💥</Cta>
        </>
      )}

      {beat === 2 && (
        <>
          <div className={styles.finaleFreeze}>
            <KickFigure height={280} impact speedlines />
          </div>
          {showCard && (
            <>
              <BigMessage delay={styles.d1}>Fuel your body.</BigMessage>
              <BigMessage accent delay={styles.d2}>Build your performance.</BigMessage>
              <Kicker>Smart nutrition for young taekwondo athletes</Kicker>
              <Narration delay={styles.d3}>
                Même athlète, même corps, mêmes quatre jauges — épisode après épisode,
                tu apprendras à lire ton propre organisme : Food &amp; Energy, Inside My
                Body, Fuel for Training, Understanding My Weight, Making Weight vs
                Performance, Build Your Training Day.
              </Narration>
              <Cta onClick={onRestart}>↺ Revoir l&apos;épisode</Cta>
            </>
          )}
        </>
      )}
    </>
  )
}
