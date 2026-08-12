// Langage visuel commun à tout le programme : les 4 jauges accompagnent
// l'athlète dans chaque épisode. Les valeurs sont toujours sur 0–100.
export type GaugeKey = "energy" | "fuel" | "hydration" | "recovery"
export type Gauges = Record<GaugeKey, number>

export const GAUGE_META: Record<GaugeKey, { icon: string; label: string; color: string }> = {
  energy: { icon: "⚡", label: "ENERGY", color: "#fbbf24" },
  fuel: { icon: "🔋", label: "FUEL", color: "#4ade80" },
  hydration: { icon: "💧", label: "HYDRATION", color: "#38bdf8" },
  recovery: { icon: "🔧", label: "RECOVERY", color: "#a78bfa" },
}

export const GAUGE_ORDER: GaugeKey[] = ["energy", "fuel", "hydration", "recovery"]

// Couleurs des trois familles de macronutriments, réutilisées partout
// (digestion, comparaison A/B) pour que le jeune les reconnaisse d'un épisode
// à l'autre.
export const MACRO_COLORS = {
  carbs: "#fbbf24",
  fats: "#f472b6",
  protein: "#60a5fa",
}

export interface SceneMeta {
  id: string
  chapter: string
  title: string
  // Valeurs HUD à l'entrée de la scène — les scènes à timeline interne les
  // font ensuite évoluer elles-mêmes via setGauges.
  gauges: Gauges
  // Les scènes en écran partagé (A/B) ont leurs propres mini-jauges :
  // on masque le HUD global pour éviter la confusion.
  hideHud?: boolean
}

export const SCENES: SceneMeta[] = [
  {
    id: "intro",
    chapter: "Prologue",
    title: "Entre dans ton corps",
    gauges: { energy: 65, fuel: 60, hydration: 65, recovery: 75 },
  },
  {
    id: "breakfast",
    chapter: "08:00",
    title: "Qu'est-ce qui se passe quand je mange ?",
    gauges: { energy: 45, fuel: 35, hydration: 55, recovery: 80 },
  },
  {
    id: "digestion",
    chapter: "Inside my body",
    title: "De l'aliment à la molécule",
    gauges: { energy: 70, fuel: 50, hydration: 58, recovery: 80 },
  },
  {
    id: "destinations",
    chapter: "Inside my body",
    title: "Où va cette énergie ?",
    gauges: { energy: 75, fuel: 65, hydration: 58, recovery: 80 },
  },
  {
    id: "schoolday",
    chapter: "08:00 → 17:00",
    title: "La journée continue",
    gauges: { energy: 72, fuel: 62, hydration: 60, recovery: 80 },
  },
  {
    id: "training",
    chapter: "17:00",
    title: "Training starts 🥋",
    gauges: { energy: 62, fuel: 55, hydration: 55, recovery: 75 },
  },
  {
    id: "burn",
    chapter: "La vraie question",
    title: "« Combien je dois courir pour brûler ça ? »",
    gauges: { energy: 32, fuel: 22, hydration: 30, recovery: 42 },
  },
  {
    id: "compare",
    chapter: "Rewind ⏪",
    title: "Deux stratégies, même athlète",
    gauges: { energy: 50, fuel: 50, hydration: 50, recovery: 50 },
    hideHud: true,
  },
  {
    id: "scale",
    chapter: "Le lendemain matin",
    title: "Que veut vraiment dire 58.2 kg ?",
    gauges: { energy: 60, fuel: 55, hydration: 60, recovery: 85 },
  },
  {
    id: "water",
    chapter: "Expérience n°1",
    title: "L'expérience de l'eau",
    gauges: { energy: 60, fuel: 55, hydration: 75, recovery: 85 },
  },
  {
    id: "glycogen",
    chapter: "Expérience n°2",
    title: "L'expérience du glycogène",
    gauges: { energy: 65, fuel: 80, hydration: 70, recovery: 85 },
  },
  {
    id: "makingweight",
    chapter: "Sport à catégories",
    title: "Making weight ≠ being ready",
    gauges: { energy: 70, fuel: 75, hydration: 70, recovery: 85 },
  },
  {
    id: "buildyourday",
    chapter: "À toi de jouer",
    title: "Build your day",
    gauges: { energy: 55, fuel: 45, hydration: 50, recovery: 70 },
  },
  {
    id: "finale",
    chapter: "Épilogue",
    title: "Fuel your body. Build your performance.",
    gauges: { energy: 90, fuel: 85, hydration: 85, recovery: 90 },
  },
]

// ---------------------------------------------------------------------------
// Comparaison A/B — mêmes horaires, deux compositions de journée.
// On ne juge pas les aliments : on compare ce qu'ils apportent.
// ---------------------------------------------------------------------------

export interface CompareStep {
  time: string
  label: string
  a: Gauges
  b: Gauges
}

export const COMPARE_BREAKFASTS = {
  a: { name: "ATHLETE A", foods: ["🥐", "🥐", "🥐", "🍩", "🍩", "🥤"] },
  b: { name: "ATHLETE B", foods: ["🥣", "🍌", "🥚", "🥛", "💧"] },
}

// Profil indicatif du petit-déjeuner (sur 100, pour les barres comparatives).
export const COMPARE_MACROS: { label: string; a: number; b: number }[] = [
  { label: "Énergie", a: 88, b: 80 },
  { label: "Glucides", a: 90, b: 78 },
  { label: "Protéines", a: 18, b: 82 },
  { label: "Lipides", a: 72, b: 40 },
  { label: "Fibres", a: 12, b: 74 },
  { label: "Hydratation", a: 30, b: 78 },
  { label: "Micronutriments", a: 20, b: 80 },
]

export const COMPARE_TIMELINE: CompareStep[] = [
  {
    time: "08:00",
    label: "Breakfast",
    a: { energy: 78, fuel: 58, hydration: 55, recovery: 80 },
    b: { energy: 72, fuel: 72, hydration: 72, recovery: 82 },
  },
  {
    time: "10:30",
    label: "School",
    a: { energy: 48, fuel: 50, hydration: 48, recovery: 78 },
    b: { energy: 66, fuel: 68, hydration: 66, recovery: 80 },
  },
  {
    time: "13:00",
    label: "Lunch",
    a: { energy: 62, fuel: 60, hydration: 52, recovery: 76 },
    b: { energy: 74, fuel: 80, hydration: 72, recovery: 82 },
  },
  {
    time: "16:00",
    label: "Pre-training",
    a: { energy: 50, fuel: 54, hydration: 46, recovery: 72 },
    b: { energy: 76, fuel: 84, hydration: 74, recovery: 80 },
  },
  {
    time: "17:00",
    label: "Taekwondo 🥋",
    a: { energy: 26, fuel: 20, hydration: 24, recovery: 46 },
    b: { energy: 52, fuel: 46, hydration: 50, recovery: 58 },
  },
  {
    time: "19:30",
    label: "Recovery",
    a: { energy: 34, fuel: 30, hydration: 34, recovery: 52 },
    b: { energy: 62, fuel: 64, hydration: 66, recovery: 78 },
  },
  {
    time: "22:30",
    label: "Sleep",
    a: { energy: 38, fuel: 36, hydration: 40, recovery: 58 },
    b: { energy: 66, fuel: 72, hydration: 72, recovery: 88 },
  },
]

// ---------------------------------------------------------------------------
// Décomposition du poids (scène balance) — parts volontairement pédagogiques,
// pas des mesures médicales.
// ---------------------------------------------------------------------------

export const WEIGHT_PARTS = [
  { icon: "💧", label: "WATER", detail: "L'eau représente une grande partie de ton poids — et elle varie d'heure en heure.", color: "#38bdf8", share: 42 },
  { icon: "🔋", label: "GLYCOGEN + ASSOCIATED WATER", detail: "Ton carburant stocké retient de l'eau : plein de carburant = un peu plus lourd.", color: "#4ade80", share: 8 },
  { icon: "🍽️", label: "DIGESTIVE CONTENTS", detail: "Ce que tu as mangé et bu est encore « en transit » dans ton système digestif.", color: "#fbbf24", share: 6 },
  { icon: "🧍", label: "BODY TISSUES", detail: "Muscles, os, organes, masse grasse… la structure de ton corps, qui évolue lentement.", color: "#a78bfa", share: 44 },
]

// ---------------------------------------------------------------------------
// Build your day — le jeune devient acteur. Chaque option agit sur les 4
// jauges ; on récompense la stratégie, jamais « l'aliment le moins calorique ».
// ---------------------------------------------------------------------------

export interface GameOption {
  foods: string
  name: string
  note: string
  effects: Partial<Gauges>
}

export interface GameSlot {
  id: string
  time: string
  title: string
  question: string
  options: GameOption[]
}

export interface GameEvent {
  kind: "choice" | "training"
  time: string
  title: string
  slot?: GameSlot
  drain?: Gauges
}

export const GAME_START: Gauges = { energy: 55, fuel: 45, hydration: 50, recovery: 70 }

const TRAINING_1_DRAIN: Gauges = { energy: 25, fuel: 30, hydration: 25, recovery: 15 }
const TRAINING_2_DRAIN: Gauges = { energy: 30, fuel: 35, hydration: 30, recovery: 20 }

export const GAME_SLOTS: GameSlot[] = [
  {
    id: "breakfast",
    time: "08:00",
    title: "Breakfast",
    question: "Séance #1 dans 2 heures. Tu prépares quoi ?",
    options: [
      {
        foods: "🥣🍌🥚🥛",
        name: "Avoine, banane, œufs, lait",
        note: "Glucides + protéines + fibres : le réservoir se remplit et tient jusqu'à la séance.",
        effects: { energy: 20, fuel: 30, hydration: 5, recovery: 10 },
      },
      {
        foods: "🥐🍩🥤",
        name: "Croissants, donuts, soda",
        note: "Énergie rapide disponible — mais peu de protéines et de fibres : attention au coup de mou en fin de séance.",
        effects: { energy: 25, fuel: 12 },
      },
      {
        foods: "⏰",
        name: "Rien, je gagne du temps",
        note: "Tu pars t'entraîner avec le réservoir de la veille. La séance #1 risque d'être longue.",
        effects: { energy: -5 },
      },
    ],
  },
  {
    id: "snack",
    time: "11:45",
    title: "Snack",
    question: "Séance #1 terminée. Tu fais quoi avant de rentrer ?",
    options: [
      {
        foods: "🥛🍎💧",
        name: "Yaourt à boire, fruit, eau",
        note: "Tu relances la récupération tout de suite : glucides + protéines + eau.",
        effects: { energy: 10, fuel: 10, hydration: 10, recovery: 15 },
      },
      {
        foods: "🍫🥤",
        name: "Barre chocolatée, soda",
        note: "Un peu d'énergie rapide, mais peu de matériaux pour réparer le muscle.",
        effects: { energy: 12, fuel: 5, recovery: 5 },
      },
      {
        foods: "🚌",
        name: "Rien, je rentre direct",
        note: "La fenêtre de récupération passe sans carburant : le corps attendra le déjeuner.",
        effects: {},
      },
    ],
  },
  {
    id: "lunch",
    time: "13:00",
    title: "Lunch",
    question: "Le vrai repas de la journée. Ton assiette ?",
    options: [
      {
        foods: "🍚🍗🥦💧",
        name: "Riz, poulet, légumes, eau",
        note: "Assiette complète : tu recharges le glycogène et tu répares.",
        effects: { energy: 15, fuel: 30, hydration: 10, recovery: 20 },
      },
      {
        foods: "🥗",
        name: "Petite salade « pour rester léger »",
        note: "Très léger avant une 2e séance intense : le réservoir ne se remplit presque pas.",
        effects: { energy: 5, fuel: 8, hydration: 5, recovery: 5 },
      },
      {
        foods: "🍔🍟",
        name: "Fast-food copieux",
        note: "De l'énergie, oui — mais digestion lourde et peu d'éléments pour récupérer.",
        effects: { energy: 5, fuel: 18, recovery: 5 },
      },
    ],
  },
  {
    id: "pretraining",
    time: "16:00",
    title: "Pre-training",
    question: "Séance #2 dans 1 heure. Dernier réglage ?",
    options: [
      {
        foods: "🍌💧",
        name: "Banane + eau",
        note: "Léger, digeste, disponible vite : exactement ce qu'il faut à 1h du combat.",
        effects: { energy: 10, fuel: 12, hydration: 8 },
      },
      {
        foods: "🍝🍝",
        name: "Grosse assiette de pâtes",
        note: "Bon carburant… mais trop tard : tu vas t'entraîner en pleine digestion.",
        effects: { energy: -10, fuel: 15 },
      },
      {
        foods: "🤐",
        name: "Rien du tout",
        note: "Jouable si le déjeuner était complet — risqué s'il était léger.",
        effects: {},
      },
    ],
  },
  {
    id: "recovery",
    time: "19:30",
    title: "Recovery",
    question: "Grosse séance #2. Et maintenant ?",
    options: [
      {
        foods: "🥛🍌🍞",
        name: "Lait, banane, pain",
        note: "Glucides + protéines + eau dans l'heure : la récupération démarre fort.",
        effects: { energy: 8, fuel: 20, hydration: 8, recovery: 25 },
      },
      {
        foods: "🥤🧃",
        name: "Juste une boisson sucrée",
        note: "Un peu de glucides, presque pas de protéines : la réparation attendra le dîner.",
        effects: { energy: 5, fuel: 8, hydration: 5, recovery: 5 },
      },
      {
        foods: "📱",
        name: "Rien, je scrolle",
        note: "Deux séances dans les jambes et aucun matériau de réparation fourni.",
        effects: {},
      },
    ],
  },
  {
    id: "dinner",
    time: "20:30",
    title: "Dinner",
    question: "Dernier repas avant la nuit. Tu choisis ?",
    options: [
      {
        foods: "🍠🐟🥕",
        name: "Féculents, poisson, légumes",
        note: "Le corps va réparer toute la nuit : tu lui donnes les matériaux.",
        effects: { energy: 5, fuel: 15, hydration: 5, recovery: 20 },
      },
      {
        foods: "🍪📺",
        name: "Grignotage devant l'écran",
        note: "De l'énergie en vrac, tard, sans vraie structure de repas.",
        effects: { energy: 5, fuel: 5, recovery: 5 },
      },
      {
        foods: "🍵",
        name: "Presque rien « pour le poids »",
        note: "Après 2 séances, priver la nuit de carburant freine la récupération et la croissance.",
        effects: { fuel: 5, recovery: 8 },
      },
    ],
  },
  {
    id: "hydration",
    time: "Toute la journée",
    title: "Hydration",
    question: "Et l'eau dans tout ça ?",
    options: [
      {
        foods: "💧💧💧",
        name: "Eau régulière toute la journée",
        note: "Petites quantités souvent : la stratégie des athlètes de haut niveau.",
        effects: { hydration: 30, recovery: 5 },
      },
      {
        foods: "💧❓",
        name: "Seulement quand j'ai soif",
        note: "La soif arrive en retard : à l'entraînement tu es déjà en déficit.",
        effects: { hydration: 10 },
      },
      {
        foods: "🥤🥤",
        name: "Surtout des sodas",
        note: "Du liquide et du sucre, mais une hydratation médiocre pour deux séances.",
        effects: { hydration: 8, energy: 5 },
      },
    ],
  },
]

// Journée simulée : les choix s'intercalent entre les deux séances, qui
// consomment un montant fixe — c'est la stratégie autour qui fait l'écart.
export const GAME_EVENTS: GameEvent[] = [
  { kind: "choice", time: "08:00", title: "Breakfast", slot: GAME_SLOTS[0] },
  { kind: "training", time: "10:00", title: "Training #1 🥋", drain: TRAINING_1_DRAIN },
  { kind: "choice", time: "11:45", title: "Snack", slot: GAME_SLOTS[1] },
  { kind: "choice", time: "13:00", title: "Lunch", slot: GAME_SLOTS[2] },
  { kind: "choice", time: "16:00", title: "Pre-training", slot: GAME_SLOTS[3] },
  { kind: "training", time: "17:00", title: "Training #2 🥋", drain: TRAINING_2_DRAIN },
  { kind: "choice", time: "19:30", title: "Recovery", slot: GAME_SLOTS[4] },
  { kind: "choice", time: "20:30", title: "Dinner", slot: GAME_SLOTS[5] },
  { kind: "choice", time: "22:00", title: "Hydration", slot: GAME_SLOTS[6] },
]

export function clampGauge(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function applyEffects(gauges: Gauges, effects: Partial<Gauges>, sign: 1 | -1 = 1): Gauges {
  return {
    energy: clampGauge(gauges.energy + sign * (effects.energy ?? 0)),
    fuel: clampGauge(gauges.fuel + sign * (effects.fuel ?? 0)),
    hydration: clampGauge(gauges.hydration + sign * (effects.hydration ?? 0)),
    recovery: clampGauge(gauges.recovery + sign * (effects.recovery ?? 0)),
  }
}
