"use client"

import type { CSSProperties, ReactNode } from "react"
import { GAUGE_META, GAUGE_ORDER, type GaugeKey, type Gauges } from "./data"
import styles from "./nutrition.module.css"

// Briques visuelles partagées par toutes les scènes : mêmes titres, mêmes
// jauges, mêmes panneaux — c'est ce vocabulaire commun qui rend le programme
// « lisible » d'un épisode à l'autre.

// Contrat commun des scènes : le lecteur fournit la navigation et le contrôle
// du HUD ; les scènes à timeline interne pilotent les jauges elles-mêmes.
export interface SceneProps {
  onAdvance: () => void
  onRestart: () => void
  setGauges: (gauges: Gauges) => void
}

export function Kicker({ children }: { children: ReactNode }) {
  return <div className={styles.kicker}>{children}</div>
}

export function SceneTitle({ children }: { children: ReactNode }) {
  return <h1 className={styles.sceneTitle}>{children}</h1>
}

export function Narration({ children, delay }: { children: ReactNode; delay?: string }) {
  return (
    <p className={`${styles.narration} ${delay ?? ""}`}>{children}</p>
  )
}

export function BigMessage({
  children,
  accent = false,
  delay,
}: {
  children: ReactNode
  accent?: boolean
  delay?: string
}) {
  return (
    <div className={`${styles.bigMsg} ${accent ? styles.bigMsgAccent : ""} ${delay ?? ""}`}>
      {children}
    </div>
  )
}

export function Panel({
  children,
  glow = false,
  className = "",
  style,
}: {
  children: ReactNode
  glow?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`${styles.panel} ${glow ? styles.panelGlow : ""} ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

export function Cta({
  children,
  onClick,
  ghost = false,
}: {
  children: ReactNode
  onClick?: () => void
  ghost?: boolean
}) {
  return (
    <button
      type="button"
      className={`${styles.cta} ${ghost ? styles.ctaGhost : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ jauges

export function GaugeBar({
  gaugeKey,
  value,
  wide = false,
}: {
  gaugeKey: GaugeKey
  value: number
  wide?: boolean
}) {
  const meta = GAUGE_META[gaugeKey]
  return (
    <div className={styles.gauge}>
      <span className={styles.gaugeIcon}>{meta.icon}</span>
      <div className={styles.gaugeBody}>
        <span className={styles.gaugeLabel}>
          <span>{meta.label}</span>
          <span>{Math.round(value)}</span>
        </span>
        <div className={styles.gaugeTrack} style={wide ? { width: "100%" } : undefined}>
          <div
            className={`${styles.gaugeFill} ${value < 25 ? styles.gaugeLow : ""}`}
            style={{ width: `${value}%`, "--gauge-color": meta.color } as CSSProperties}
          />
        </div>
      </div>
    </div>
  )
}

export function Hud({ gauges, hidden = false }: { gauges: Gauges; hidden?: boolean }) {
  return (
    <div className={`${styles.hud} ${hidden ? styles.hudHidden : ""}`} aria-hidden={hidden}>
      {GAUGE_ORDER.map((key) => (
        <GaugeBar key={key} gaugeKey={key} value={gauges[key]} />
      ))}
    </div>
  )
}

// Version compacte empilée, pour les écrans partagés et le jeu.
export function GaugeStack({ gauges }: { gauges: Gauges }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", width: "100%" }}>
      {GAUGE_ORDER.map((key) => {
        const meta = GAUGE_META[key]
        const value = gauges[key]
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ width: "1.3rem", textAlign: "center" }}>{meta.icon}</span>
            <div className={styles.gaugeTrack} style={{ flex: 1, height: "0.45rem" }}>
              <div
                className={`${styles.gaugeFill} ${value < 25 ? styles.gaugeLow : ""}`}
                style={{ width: `${value}%`, "--gauge-color": meta.color } as CSSProperties}
              />
            </div>
            <span
              style={{
                width: "2rem",
                fontSize: "0.7rem",
                fontWeight: 700,
                color: meta.color,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {Math.round(value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------- décor

export function FoodRow({
  foods,
  eaten = false,
  float = false,
}: {
  foods: string[]
  eaten?: boolean
  float?: boolean
}) {
  return (
    <div className={styles.foodRow}>
      {foods.map((food, i) => (
        <span
          key={i}
          className={`${styles.foodItem} ${eaten ? styles.foodEaten : ""} ${float ? styles.floaty : ""}`}
          style={{ animationDelay: `${i * 0.12}s` }}
        >
          {food}
        </span>
      ))}
    </div>
  )
}

export function Battery({ label, level }: { label: string; level: number }) {
  return (
    <div className={styles.battery}>
      <div className={styles.batteryShell}>
        <div className={styles.batteryFill} style={{ height: `${level}%` }} />
      </div>
      <span className={styles.batteryLabel}>{label}</span>
    </div>
  )
}

export function TimelineChips({
  steps,
  activeIndex,
}: {
  steps: { time: string; label?: string }[]
  activeIndex: number
}) {
  return (
    <div className={styles.timeline}>
      {steps.map((step, i) => (
        <span
          key={step.time}
          className={`${styles.timeChip} ${
            i === activeIndex ? styles.timeChipActive : i < activeIndex ? styles.timeChipDone : ""
          }`}
        >
          {step.time}
          {step.label ? ` · ${step.label}` : ""}
        </span>
      ))}
    </div>
  )
}

export function FactorBadge({
  icon,
  label,
  color,
  delay = 0,
}: {
  icon: string
  label: string
  color: string
  delay?: number
}) {
  return (
    <span
      className={styles.factorBadge}
      style={{ "--badge-color": color, animationDelay: `${delay}s` } as CSSProperties}
    >
      <span>{icon}</span>
      {label}
    </span>
  )
}

export function ScaleDisplay({ value, unit = "KG" }: { value: string; unit?: string }) {
  return (
    <div className={styles.scaleDisplay}>
      <span className={styles.scaleValue}>{value}</span>
      <span className={styles.scaleUnit}>{unit}</span>
    </div>
  )
}
