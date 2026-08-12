"use client"

import { useState } from "react"
import { AthleteFigure } from "./athlete"
import { WEIGHT_PARTS } from "./data"
import {
  Battery,
  BigMessage,
  Cta,
  FactorBadge,
  Kicker,
  Narration,
  Panel,
  ScaleDisplay,
  SceneTitle,
  type SceneProps,
} from "./parts"
import styles from "./nutrition.module.css"

// --------------------------------------------- Que veut dire 58.2 kg ?

export function ScaleScene({ onAdvance }: SceneProps) {
  const [beat, setBeat] = useState(0)
  const [focus, setFocus] = useState<number | null>(null)

  return (
    <>
      <Kicker>Le lendemain matin</Kicker>
      {beat === 0 && (
        <>
          <SceneTitle>Il monte sur la balance</SceneTitle>
          <div className="flex flex-col items-center gap-4">
            <AthleteFigure height={210} />
            <ScaleDisplay value="58.2" />
          </div>
          <Narration>
            Il regarde le chiffre. La vidéo s&apos;arrête. ⏸
          </Narration>
          <BigMessage delay={styles.d2}>What does 58.2 kg really mean?</BigMessage>
          <Cta onClick={() => setBeat(1)}>Décomposer le chiffre 🔍</Cta>
        </>
      )}

      {beat === 1 && (
        <>
          <SceneTitle>58.2 kg, c&apos;est tout ça à la fois</SceneTitle>
          <div className={styles.weightBar}>
            {WEIGHT_PARTS.map((part, i) => (
              <button
                key={part.label}
                type="button"
                className={`${styles.weightSegment} ${
                  focus !== null && focus !== i ? styles.weightSegmentDim : ""
                }`}
                style={{ width: `${part.share}%`, background: part.color, animationDelay: `${i * 0.2}s` }}
                onClick={() => setFocus(focus === i ? null : i)}
                aria-label={part.label}
              >
                {part.icon}
              </button>
            ))}
          </div>
          <div className={styles.panelGrid}>
            {WEIGHT_PARTS.map((part, i) => (
              <Panel
                key={part.label}
                glow={focus === i}
                style={{ opacity: focus === null || focus === i ? 1 : 0.35 }}
              >
                <p className="text-xs font-black uppercase tracking-widest" style={{ color: part.color }}>
                  {part.icon} {part.label}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{part.detail}</p>
              </Panel>
            ))}
          </div>
          <BigMessage accent delay={styles.d2}>Body weight ≠ body fat</BigMessage>
          <Cta onClick={onAdvance}>Faire l&apos;expérience 💧</Cta>
        </>
      )}
    </>
  )
}

// ------------------------------------------------------ L'expérience de l'eau

export function WaterScene({ onAdvance }: SceneProps) {
  const [beat, setBeat] = useState(0)

  return (
    <>
      <Kicker>Expérience n°1 — l&apos;eau</Kicker>
      {beat === 0 && (
        <>
          <SceneTitle>Il boit un grand verre d&apos;eau 💧</SceneTitle>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <ScaleDisplay value="58.2 → 58.7" />
            <Panel className="max-w-xs">
              <p className="text-sm leading-relaxed text-slate-200">
                Son poids augmente <strong>immédiatement</strong>{" "}d&apos;un demi-kilo.
                A-t-il pris de la masse grasse ?
              </p>
            </Panel>
          </div>
          <BigMessage delay={styles.d1}>Body fat ≠ ↑</BigMessage>
          <Cta onClick={() => setBeat(1)}>Puis il s&apos;entraîne 🥋</Cta>
        </>
      )}
      {beat === 1 && (
        <>
          <SceneTitle>Une heure d&apos;entraînement plus tard…</SceneTitle>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <ScaleDisplay value="58.7 → 57.9" />
            <Panel className="max-w-xs">
              <p className="text-sm leading-relaxed text-slate-200">
                Il a transpiré : le poids <strong>descend</strong>. A-t-il perdu de la
                masse grasse pour autant ?
              </p>
            </Panel>
          </div>
          <BigMessage delay={styles.d1}>Body fat ≠ nécessairement ↓</BigMessage>
          <BigMessage accent delay={styles.d2}>Water loss ≠ fat loss</BigMessage>
          <Narration delay={styles.d3}>
            Dans un sport à catégories de poids, confondre les deux est le piège
            classique — et il coûte cher le jour de la pesée.
          </Narration>
          <Cta onClick={onAdvance}>Expérience n°2 🔋</Cta>
        </>
      )}
    </>
  )
}

// -------------------------------------------------- L'expérience du glycogène

export function GlycogenScene({ onAdvance }: SceneProps) {
  return (
    <>
      <Kicker>Expérience n°2 — le glycogène</Kicker>
      <SceneTitle>Retour à l&apos;intérieur des muscles</SceneTitle>
      <div className="flex flex-wrap items-center justify-center gap-8">
        <AthleteFigure height={250} xray highlight="glycogen" />
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-end gap-4">
            <Battery label="Glycogen ↑" level={88} />
            <span className="pb-6 text-3xl">+ 💧</span>
          </div>
          <Panel className="max-w-xs">
            <p className="text-sm leading-relaxed text-slate-200">
              Après une alimentation riche en glucides, les réserves se remplissent —
              et <strong>chaque gramme de glycogène retient de l&apos;eau</strong>.
              La balance monte un peu… alors que l&apos;athlète a{" "}
              <strong>plus de carburant</strong>{" "}pour performer.
            </p>
          </Panel>
        </div>
      </div>
      <BigMessage delay={styles.d1}>« Plus lourd ne veut pas dire plus gras. »</BigMessage>
      <BigMessage accent delay={styles.d2}>« Plus léger ne veut pas dire mieux préparé. »</BigMessage>
      <Cta onClick={onAdvance}>Et en compétition ? ⚖️</Cta>
    </>
  )
}

// --------------------------------------------- Making weight vs performance

export function MakingWeightScene({ onAdvance }: SceneProps) {
  return (
    <>
      <Kicker>Sport à catégories de poids</Kicker>
      <SceneTitle>La pesée officielle</SceneTitle>
      <div className="flex flex-col items-center gap-3">
        <ScaleDisplay value="58.2" />
        <span className={styles.clockSmall}>CATÉGORIE : −59 KG</span>
      </div>
      <div className="flex max-w-xl flex-wrap justify-center gap-2">
        <FactorBadge icon="🥋" label="Performance" color="#f43f5e" />
        <FactorBadge icon="⚡" label="Energy" color="#fbbf24" delay={0.12} />
        <FactorBadge icon="💧" label="Hydration" color="#38bdf8" delay={0.24} />
        <FactorBadge icon="🔧" label="Recovery" color="#a78bfa" delay={0.36} />
        <FactorBadge icon="📈" label="Growth" color="#4ade80" delay={0.48} />
        <FactorBadge icon="⚖️" label="Body weight" color="#e2e8f0" delay={0.6} />
      </div>
      <BigMessage delay={styles.d1}>Making weight ≠ being ready to fight</BigMessage>
      <Narration delay={styles.d2}>
        À 14–16 ans, ton corps est en pleine croissance et maturation. Il doit fournir
        de l&apos;énergie pour <strong>vivre + grandir + étudier + récupérer +
        s&apos;entraîner + performer</strong>. Le poids n&apos;est qu&apos;une des six
        pièces du puzzle.
      </Narration>
      <BigMessage delay={styles.d3}>The goal is not to be as light as possible.</BigMessage>
      <BigMessage accent delay={styles.d4}>The goal is to arrive ready to perform.</BigMessage>
      <Cta onClick={onAdvance}>À toi de jouer 🎮</Cta>
    </>
  )
}
