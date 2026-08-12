"use client"

import styles from "./nutrition.module.css"

// Le même athlète 3D-stylisé dans tous les épisodes : à l'extérieur en dobok,
// puis en mode « rayons X » quand la caméra entre dans son corps. Les organes
// sont volontairement simplifiés — c'est un langage visuel, pas un atlas
// d'anatomie.

const SKIN = "#f2c094"
const HAIR = "#1f2430"
const DOBOK = "#f8fafc"
const BELT = "#ef4444"
const XRAY_FILL = "rgba(56, 189, 248, 0.10)"
const XRAY_LINE = "rgba(125, 211, 252, 0.75)"

export type AthleteHighlight = "digestion" | "blood" | "brain" | "glycogen" | null

export function AthleteFigure({
  xray = false,
  highlight = null,
  height = 300,
}: {
  xray?: boolean
  highlight?: AthleteHighlight
  height?: number
}) {
  return (
    <svg
      viewBox="0 0 200 340"
      height={height}
      role="img"
      aria-label={xray ? "Vue intérieure du corps de l'athlète" : "Jeune athlète de taekwondo"}
      style={{ overflow: "visible" }}
    >
      {/* halo derrière le personnage */}
      <ellipse cx="100" cy="330" rx="70" ry="9" fill="rgba(56,189,248,0.12)" />

      {/* jambes (pantalon large de dobok) */}
      <line x1="87" y1="180" x2="80" y2="300" stroke={xray ? XRAY_LINE : DOBOK} strokeWidth={xray ? 2 : 24} strokeLinecap="round" fill="none" />
      <line x1="113" y1="180" x2="120" y2="300" stroke={xray ? XRAY_LINE : DOBOK} strokeWidth={xray ? 2 : 24} strokeLinecap="round" fill="none" />
      {xray && (
        <>
          <line x1="87" y1="180" x2="80" y2="300" stroke={XRAY_FILL} strokeWidth="22" strokeLinecap="round" />
          <line x1="113" y1="180" x2="120" y2="300" stroke={XRAY_FILL} strokeWidth="22" strokeLinecap="round" />
        </>
      )}
      {/* pieds nus */}
      <ellipse cx="77" cy="310" rx="12" ry="6" fill={xray ? XRAY_LINE : SKIN} opacity={xray ? 0.5 : 1} />
      <ellipse cx="123" cy="310" rx="12" ry="6" fill={xray ? XRAY_LINE : SKIN} opacity={xray ? 0.5 : 1} />

      {/* torse (veste de dobok) */}
      <path
        d="M72,80 Q100,73 128,80 L135,172 Q100,182 65,172 Z"
        fill={xray ? XRAY_FILL : DOBOK}
        stroke={xray ? XRAY_LINE : "rgba(15,23,42,0.15)"}
        strokeWidth={xray ? 2 : 1}
      />

      {/* bras */}
      <line x1="70" y1="90" x2="54" y2="152" stroke={xray ? XRAY_LINE : DOBOK} strokeWidth={xray ? 2 : 16} strokeLinecap="round" />
      <line x1="130" y1="90" x2="146" y2="152" stroke={xray ? XRAY_LINE : DOBOK} strokeWidth={xray ? 2 : 16} strokeLinecap="round" />
      {xray && (
        <>
          <line x1="70" y1="90" x2="54" y2="152" stroke={XRAY_FILL} strokeWidth="14" strokeLinecap="round" />
          <line x1="130" y1="90" x2="146" y2="152" stroke={XRAY_FILL} strokeWidth="14" strokeLinecap="round" />
        </>
      )}
      <circle cx="53" cy="160" r="6.5" fill={xray ? XRAY_LINE : SKIN} opacity={xray ? 0.5 : 1} />
      <circle cx="147" cy="160" r="6.5" fill={xray ? XRAY_LINE : SKIN} opacity={xray ? 0.5 : 1} />

      {!xray && (
        <>
          {/* col en V + ceinture */}
          <path d="M100,80 L88,114" stroke="#0f172a" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.85" />
          <path d="M100,80 L112,114" stroke="#0f172a" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.85" />
          <rect x="68" y="146" width="64" height="9" rx="3" fill={BELT} />
          <path d="M97,152 L91,176" stroke={BELT} strokeWidth="7" strokeLinecap="round" />
          <path d="M103,152 L110,176" stroke={BELT} strokeWidth="7" strokeLinecap="round" />
        </>
      )}

      {/* cou + tête */}
      <rect x="93" y="62" width="14" height="14" rx="5" fill={xray ? XRAY_FILL : SKIN} stroke={xray ? XRAY_LINE : "none"} />
      <ellipse
        cx="100"
        cy="46"
        rx="20"
        ry="22"
        fill={xray ? XRAY_FILL : SKIN}
        stroke={xray ? XRAY_LINE : "none"}
        strokeWidth="2"
      />
      {!xray && (
        <>
          <path d="M79,42 Q84,20 100,21 Q116,20 121,42 Q114,32 100,31 Q86,32 79,42 Z" fill={HAIR} />
          <circle cx="92" cy="47" r="2.1" fill="#1f2430" />
          <circle cx="108" cy="47" r="2.1" fill="#1f2430" />
          <path d="M94,57 Q100,60 106,57" stroke="#1f2430" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </>
      )}

      {xray && (
        <g>
          {/* cerveau */}
          <ellipse
            cx="100"
            cy="42"
            rx="13"
            ry="10"
            fill={highlight === "brain" ? "#f9a8d4" : "rgba(249,168,212,0.55)"}
            className={highlight === "brain" ? styles.pulse : undefined}
          />
          <path
            d="M90,42 Q95,37 100,42 Q105,47 110,42"
            stroke="rgba(190,24,93,0.6)"
            strokeWidth="1.6"
            fill="none"
          />

          {/* œsophage */}
          <path d="M100,58 C100,74 101,84 106,96" stroke="rgba(251,191,36,0.7)" strokeWidth="3" fill="none" />

          {/* poumons */}
          <path d="M88,96 q-9,4 -8,20 q1,12 9,12 q6,-1 6,-14 l0,-14 Z" fill="rgba(125,211,252,0.35)" />
          <path d="M112,96 q9,4 8,20 q-1,12 -9,12 q-6,-1 -6,-14 l0,-14 Z" fill="rgba(125,211,252,0.35)" />

          {/* cœur */}
          <path
            d="M100,104 c3,-6 12,-5 12,2 c0,6 -7,10 -12,13 c-5,-3 -12,-7 -12,-13 c0,-7 9,-8 12,-2 Z"
            fill="#fb7185"
            className={styles.pulse}
            style={{ transformOrigin: "100px 110px" }}
          />

          {/* foie + estomac */}
          <path
            d="M78,128 q4,-8 18,-6 l8,3 q4,10 -6,12 q-16,3 -20,-9 Z"
            fill={highlight === "glycogen" ? "#4ade80" : "rgba(74,222,128,0.4)"}
          />
          <path
            d="M108,124 q12,-2 14,8 q2,10 -8,12 q-10,1 -12,-8 q-1,-9 6,-12 Z"
            fill={highlight === "digestion" ? "#fbbf24" : "rgba(251,191,36,0.45)"}
            className={highlight === "digestion" ? styles.pulse : undefined}
            style={{ transformOrigin: "114px 134px" }}
          />

          {/* intestins */}
          <path
            d="M82,150 q18,-6 36,0 M82,158 q18,6 36,0 M84,166 q16,-5 32,0"
            stroke={highlight === "digestion" ? "rgba(251,146,60,0.95)" : "rgba(251,146,60,0.55)"}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
          />

          {/* cuisses : réserve de glycogène musculaire */}
          {highlight === "glycogen" && (
            <>
              <line x1="87" y1="185" x2="83" y2="240" stroke="rgba(74,222,128,0.9)" strokeWidth="14" strokeLinecap="round" className={styles.pulse} />
              <line x1="113" y1="185" x2="117" y2="240" stroke="rgba(74,222,128,0.9)" strokeWidth="14" strokeLinecap="round" className={styles.pulse} />
            </>
          )}

          {/* circulation : le glucose voyage du ventre vers tout le corps */}
          {(highlight === "blood" || highlight === "glycogen" || highlight === "brain") && (
            <g>
              <path
                id="blood-main"
                d="M108,132 C104,120 102,112 100,106 C98,96 99,74 100,52"
                stroke="rgba(248,113,113,0.35)"
                strokeWidth="3"
                fill="none"
              />
              <path
                id="blood-legs"
                d="M108,132 C106,152 96,168 90,190 C86,220 84,260 81,296"
                stroke="rgba(248,113,113,0.35)"
                strokeWidth="3"
                fill="none"
              />
              <path
                id="blood-arm"
                d="M108,132 C114,120 124,104 130,96 C136,108 142,132 145,150"
                stroke="rgba(248,113,113,0.35)"
                strokeWidth="3"
                fill="none"
              />
              {[0, 1, 2].map((i) => (
                <circle key={`m${i}`} r="3.2" fill="#fcd34d" style={{ filter: "drop-shadow(0 0 4px #fcd34d)" }}>
                  <animateMotion
                    dur="3.2s"
                    begin={`${-i * 1.1}s`}
                    repeatCount="indefinite"
                    path="M108,132 C104,120 102,112 100,106 C98,96 99,74 100,52"
                  />
                </circle>
              ))}
              {[0, 1, 2].map((i) => (
                <circle key={`l${i}`} r="3.2" fill="#fcd34d" style={{ filter: "drop-shadow(0 0 4px #fcd34d)" }}>
                  <animateMotion
                    dur="3.8s"
                    begin={`${-i * 1.3}s`}
                    repeatCount="indefinite"
                    path="M108,132 C106,152 96,168 90,190 C86,220 84,260 81,296"
                  />
                </circle>
              ))}
              {[0, 1].map((i) => (
                <circle key={`a${i}`} r="3.2" fill="#fcd34d" style={{ filter: "drop-shadow(0 0 4px #fcd34d)" }}>
                  <animateMotion
                    dur="3s"
                    begin={`${-i * 1.5}s`}
                    repeatCount="indefinite"
                    path="M108,132 C114,120 124,104 130,96 C136,108 142,132 145,150"
                  />
                </circle>
              ))}
            </g>
          )}
        </g>
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Figure d'action « capsules » pour les poses dynamiques (garde, side kick).
// ---------------------------------------------------------------------------

function Capsule({
  x1,
  y1,
  x2,
  y2,
  w,
  color = DOBOK,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  w: number
  color?: string
}) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeLinecap="round" />
}

export function GuardFigure({ height = 220 }: { height?: number }) {
  return (
    <svg viewBox="0 0 220 230" height={height} role="img" aria-label="Athlète en garde">
      <ellipse cx="105" cy="220" rx="62" ry="7" fill="rgba(56,189,248,0.12)" />
      {/* jambes en position de combat */}
      <Capsule x1={100} y1={126} x2={80} y2={166} w={17} />
      <Capsule x1={80} y1={166} x2={72} y2={206} w={15} />
      <Capsule x1={104} y1={126} x2={128} y2={164} w={17} />
      <Capsule x1={128} y1={164} x2={132} y2={206} w={15} />
      <ellipse cx="70" cy="212" rx="9" ry="5" fill={SKIN} />
      <ellipse cx="133" cy="212" rx="9" ry="5" fill={SKIN} />
      {/* torse + ceinture */}
      <Capsule x1={105} y1={68} x2={101} y2={122} w={30} />
      <Capsule x1={90} y1={117} x2={114} y2={119} w={9} color={BELT} />
      {/* bras en garde */}
      <Capsule x1={100} y1={76} x2={78} y2={98} w={14} />
      <Capsule x1={78} y1={98} x2={90} y2={68} w={13} />
      <Capsule x1={110} y1={76} x2={132} y2={100} w={14} />
      <Capsule x1={132} y1={100} x2={120} y2={68} w={13} />
      <circle cx="90" cy="65" r="6" fill={SKIN} />
      <circle cx="120" cy="65" r="6" fill={SKIN} />
      {/* tête + cheveux */}
      <circle cx="105" cy="42" r="16" fill={SKIN} />
      <path d="M89,40 Q93,24 105,25 Q117,24 121,40 Q113,32 105,32 Q97,32 89,40 Z" fill={HAIR} />
    </svg>
  )
}

export function KickFigure({
  height = 220,
  impact = false,
  speedlines = false,
}: {
  height?: number
  impact?: boolean
  speedlines?: boolean
}) {
  return (
    <svg viewBox="0 0 250 230" height={height} role="img" aria-label="Side kick explosif">
      <ellipse cx="100" cy="220" rx="62" ry="7" fill="rgba(56,189,248,0.12)" />
      {speedlines && (
        <g className={styles.speedlines}>
          <line x1="120" y1="70" x2="235" y2="62" />
          <line x1="115" y1="120" x2="240" y2="118" />
          <line x1="120" y1="165" x2="230" y2="170" />
        </g>
      )}
      {/* jambe d'appui */}
      <Capsule x1={100} y1={126} x2={88} y2={166} w={16} />
      <Capsule x1={88} y1={166} x2={84} y2={206} w={14} />
      <ellipse cx="83" cy="212" rx="9" ry="5" fill={SKIN} />
      {/* torse incliné */}
      <Capsule x1={82} y1={74} x2={100} y2={122} w={27} />
      <Capsule x1={86} y1={114} x2={108} y2={121} w={9} color={BELT} />
      {/* jambe qui frappe, tendue à hauteur de tête */}
      <Capsule x1={102} y1={122} x2={152} y2={108} w={17} />
      <Capsule x1={152} y1={108} x2={200} y2={94} w={15} />
      <ellipse cx="207" cy="92" rx="10" ry="6" fill={SKIN} transform="rotate(-16 207 92)" />
      {/* bras */}
      <Capsule x1={84} y1={82} x2={62} y2={102} w={13} />
      <Capsule x1={62} y1={102} x2={72} y2={126} w={12} />
      <Capsule x1={90} y1={84} x2={116} y2={100} w={13} />
      <circle cx="121" cy="103" r="5.5" fill={SKIN} />
      <circle cx="70" cy="131" r="5.5" fill={SKIN} />
      {/* tête */}
      <circle cx="76" cy="54" r="15" fill={SKIN} />
      <path d="M61,52 Q65,37 76,38 Q87,37 91,52 Q84,44 76,44 Q68,44 61,52 Z" fill={HAIR} />
      {impact && (
        <g className={styles.pulse} style={{ transformOrigin: "218px 90px" }}>
          <path
            d="M218,66 L223,82 L240,80 L227,92 L236,106 L219,99 L212,114 L209,97 L192,98 L206,88 L198,72 L213,81 Z"
            fill="#fcd34d"
            style={{ filter: "drop-shadow(0 0 12px rgba(252,211,77,0.9))" }}
          />
        </g>
      )}
    </svg>
  )
}
