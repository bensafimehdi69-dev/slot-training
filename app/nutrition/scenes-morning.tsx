"use client"

import { useState } from "react"
import { AthleteFigure } from "./athlete"
import { MACRO_COLORS } from "./data"
import {
  Battery,
  BigMessage,
  Cta,
  FactorBadge,
  FoodRow,
  Kicker,
  Narration,
  Panel,
  SceneTitle,
  type SceneProps,
} from "./parts"
import styles from "./nutrition.module.css"

const BREAKFAST = ["🥐", "🥐", "🥐", "🍩", "🍩", "🥤"]

// ---------------------------------------------------------------- Prologue

export function IntroScene({ onAdvance }: SceneProps) {
  return (
    <>
      <Kicker>Smart nutrition for young taekwondo athletes</Kicker>
      <SceneTitle>Entre dans ton corps</SceneTitle>
      <Narration>
        Voici ton double : 15 ans, 58 kg, athlète de taekwondo de haut niveau.
        Aujourd&apos;hui, on ne va pas te faire un cours de nutrition — on va entrer
        <strong> à l&apos;intérieur de son corps</strong>{" "}pour voir ce qui se passe vraiment
        quand il mange, s&apos;entraîne, récupère et monte sur la balance.
      </Narration>
      <div className={styles.floaty}>
        <AthleteFigure height={260} />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {["JE MANGE", "JE DIGÈRE", "J'UTILISE / JE STOCKE", "JE M'ENTRAÎNE", "JE RÉCUPÈRE", "MON POIDS ÉVOLUE", "JE PERFORME"].map(
          (step, i) => (
            <span key={step} className={styles.timeChip} style={{ animationDelay: `${i * 0.1}s` }}>
              {step}
              {i < 6 ? " →" : ""}
            </span>
          )
        )}
      </div>
      <Narration delay={styles.d2}>
        Quatre indicateurs vont l&apos;accompagner partout — apprends à les lire,
        ce sont ceux de ton propre corps :
      </Narration>
      <div className="flex flex-wrap justify-center gap-2">
        <FactorBadge icon="⚡" label="Energy" color="#fbbf24" delay={0.2} />
        <FactorBadge icon="🔋" label="Fuel" color="#4ade80" delay={0.35} />
        <FactorBadge icon="💧" label="Hydration" color="#38bdf8" delay={0.5} />
        <FactorBadge icon="🔧" label="Recovery" color="#a78bfa" delay={0.65} />
      </div>
      <Cta onClick={onAdvance}>Commencer la journée →</Cta>
    </>
  )
}

// -------------------------------------------------------- 08:00 — il mange

export function BreakfastScene({ onAdvance }: SceneProps) {
  const [eaten, setEaten] = useState(false)

  return (
    <>
      <div className={styles.clock}>08:00</div>
      <SceneTitle>Petit-déjeuner avant une grosse journée</SceneTitle>
      <Narration>
        Entraînement prévu à <strong>17:00</strong>. Au menu de ce matin : trois petits
        croissants, deux donuts et un jus d&apos;orange sucré. Pas de panique — aucun de ces
        aliments n&apos;est « interdit ». La vraie question est ailleurs.
      </Narration>
      <div className="flex flex-wrap items-end justify-center gap-6">
        <AthleteFigure height={230} />
        <FoodRow foods={BREAKFAST} eaten={eaten} />
      </div>
      {!eaten ? (
        <Cta onClick={() => setEaten(true)}>Il mange 🍽️</Cta>
      ) : (
        <>
          <BigMessage delay={styles.d1}>What happens inside my body?</BigMessage>
          <Narration delay={styles.d2}>
            La caméra plonge à l&apos;intérieur. Accroche-toi : on suit les aliments
            jusqu&apos;à la molécule.
          </Narration>
          <Cta onClick={onAdvance}>Entrer dans le corps 🔬</Cta>
        </>
      )}
    </>
  )
}

// -------------------------------------------- Digestion → macronutriments

export function DigestionScene({ onAdvance }: SceneProps) {
  const [step, setStep] = useState(0)

  return (
    <>
      <Kicker>Inside my body</Kicker>
      <SceneTitle>De l&apos;aliment à la molécule</SceneTitle>
      <div className="flex flex-wrap items-center justify-center gap-8">
        <AthleteFigure height={280} xray highlight={step >= 2 ? "blood" : "digestion"} />
        <div className="flex max-w-sm flex-col gap-3">
          {step >= 0 && (
            <Panel className={styles.fadeUp}>
              <p className="text-sm leading-relaxed text-slate-200">
                Dans le système digestif, les croissants, donuts et le jus sont
                progressivement <strong>découpés en briques minuscules</strong>. Trois
                grandes familles apparaissent :
              </p>
            </Panel>
          )}
          {step >= 1 && (
            <div className="flex flex-wrap justify-center gap-2">
              <FactorBadge icon="🟡" label="Carbohydrates" color={MACRO_COLORS.carbs} />
              <FactorBadge icon="🩷" label="Fats" color={MACRO_COLORS.fats} delay={0.15} />
              <FactorBadge icon="🔵" label="Protein" color={MACRO_COLORS.protein} delay={0.3} />
            </div>
          )}
          {step >= 2 && (
            <Panel glow className={styles.fadeUp}>
              <p className="text-sm leading-relaxed text-slate-200">
                Les glucides sont notamment transformés en <strong>glucose</strong>{" "}— les
                points dorés que tu vois circuler. Le glucose rejoint la circulation
                sanguine et voyage vers tous les organes.
              </p>
            </Panel>
          )}
        </div>
      </div>
      {step < 2 ? (
        <Cta onClick={() => setStep(step + 1)}>
          {step === 0 ? "Découper les aliments →" : "Suivre les molécules →"}
        </Cta>
      ) : (
        <>
          <BigMessage delay={styles.d1}>Glucose enters the bloodstream</BigMessage>
          <Cta onClick={onAdvance}>Où va cette énergie ? →</Cta>
        </>
      )}
    </>
  )
}

// ----------------------------------------------------- Où va cette énergie ?

export function DestinationsScene({ onAdvance }: SceneProps) {
  const [step, setStep] = useState(0)

  return (
    <>
      <Kicker>Inside my body</Kicker>
      <SceneTitle>Où va cette énergie ?</SceneTitle>
      <div className={styles.panelGrid}>
        <Panel glow={step === 0} style={{ opacity: step >= 0 ? 1 : 0.3 }}>
          <div className="mb-2 text-2xl">⚡ 🧠 ❤️ 🌡️</div>
          <p className="text-sm font-bold uppercase tracking-widest text-amber-300">Utilisation immédiate</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            Une partie de l&apos;énergie sert tout de suite : cerveau, cœur, organes,
            mouvements, température corporelle, vie quotidienne.
          </p>
        </Panel>
        <Panel glow={step === 1} style={{ opacity: step >= 1 ? 1 : 0.25 }}>
          <div className="mb-3 flex items-end justify-center gap-4">
            <Battery label="Muscle" level={step >= 1 ? 82 : 30} />
            <Battery label="Foie" level={step >= 1 ? 70 : 30} />
          </div>
          <p className="text-sm font-bold uppercase tracking-widest text-green-300">
            Muscle glycogen ↑
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            Une partie du glucose rejoint les muscles et le foie, stockée sous forme de{" "}
            <strong>glycogène</strong>{" "}— des batteries de carburant pour tes entraînements
            intensifs.
          </p>
        </Panel>
        <Panel glow={step === 2} style={{ opacity: step >= 2 ? 1 : 0.25 }}>
          <div className="mb-2 text-2xl">📦 🕰️</div>
          <p className="text-sm font-bold uppercase tracking-widest text-violet-300">Stockage énergétique</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            Si les apports dépassent <strong>régulièrement</strong>{" "}les besoins, les
            réserves corporelles peuvent augmenter dans la durée — notamment la masse
            grasse. Mais jamais à cause d&apos;un seul donut.
          </p>
        </Panel>
      </div>
      {step === 0 && (
        <>
          <BigMessage delay={styles.d1}>Your body uses energy 24 hours a day.</BigMessage>
          <Narration delay={styles.d2}>
            Tu dépenses de l&apos;énergie même quand tu ne fais pas de sport.
          </Narration>
          <Cta onClick={() => setStep(1)}>Voir les réserves 🔋</Cta>
        </>
      )}
      {step === 1 && (
        <>
          <BigMessage delay={styles.d1}>Glycogen = stored carbohydrate fuel</BigMessage>
          <Cta onClick={() => setStep(2)}>Et le reste ? →</Cta>
        </>
      )}
      {step === 2 && (
        <>
          <BigMessage accent delay={styles.d1}>
            Body composition changes over time — not after one food.
          </BigMessage>
          <Cta onClick={onAdvance}>La journée continue →</Cta>
        </>
      )}
    </>
  )
}
