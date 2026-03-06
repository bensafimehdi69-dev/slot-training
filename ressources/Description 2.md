# Slot Training — Description complète du projet

## 1. Vision et problème résolu

### Le problème

Les managers sportifs (entraîneurs, préparateurs) coordonnent les entraînements de groupes de 12 à 20 athlètes étudiants qui jonglent entre cours universitaires, adresses différentes (domicile, fac, club) et temps de trajet variables. Aujourd'hui, cette coordination passe par WhatsApp et des tableurs — un processus chaotique, chronophage (~3h par période) et structurellement faux : un athlète "disponible à 16h" ne l'est en réalité qu'à 16h45 une fois son trajet de 45 minutes pris en compte.

### La solution

Slot Training remplace la coordination manuelle par un système intelligent qui :

1. **Collecte** les emplois du temps, adresses et contraintes de chaque athlète via un formulaire unique
2. **Calcule** les temps de trajet réels via Google Maps Distance Matrix API (avec cache de 7 jours)
3. **Détermine** l'adresse de départ contextuelle (domicile ou fac, selon les cours du jour)
4. **Optimise** automatiquement le créneau collectif maximisant la participation du groupe
5. **Propose** des créneaux individuels complémentaires pour les athlètes exclus du créneau collectif
6. **Explique** chaque décision de manière transparente ("Zara exclue : trajet 1h45 + cours jusqu'à 17h30")

### Impact

- Temps de planification : de ~3 heures à <15 minutes par période
- Taux de présence amélioré grâce à une planification tenant compte de la logistique réelle
- Zéro friction pour les athlètes : inscription par lien magique, formulaire en quelques minutes

---

## 2. Utilisateurs cibles

### Manager (utilisateur principal)

**Profil type : Karim, 42 ans, entraîneur en centre de formation**
- Encadre 12-20 athlètes étudiants
- Gère 2-4 périodes d'entraînement par an (2-3 semaines chacune)
- Besoin : vue consolidée des contraintes, planification automatisée intégrant les trajets

### Athlète (utilisateur principal)

**Profil type : Inès, 19 ans, étudiante STAPS L2, athlète régionale**
- Vit à Montreuil, étudie à Paris 6e, s'entraîne à Vincennes
- Besoin : un planning qui respecte sa vie et pas un créneau arbitraire imposé
- Frustration passée : "en retard" alors que le problème est logistique

---

## 3. Stack technique

| Couche | Technologie | Version |
|--------|-------------|---------|
| **Frontend** | Next.js (App Router) + React | 16.1.6 / 19.2.3 |
| **Langage** | TypeScript (strict mode) | 5.x |
| **Styles** | Tailwind CSS + shadcn/ui | 4.x |
| **Validation** | Zod | 4.x |
| **Formulaires** | React Hook Form | 7.x |
| **Auth** | Firebase Auth (email/password managers, email link athlètes) | 12.x |
| **Base de données** | Cloud Firestore (NoSQL, temps réel) | via Firebase Admin 13.x |
| **Emails** | Resend | 6.x |
| **Cartes** | Google Maps (Distance Matrix, JavaScript API, Places, Geocoding) | via @vis.gl/react-google-maps |
| **Notifications UI** | Sonner (toasts) | 2.x |
| **Icônes** | Lucide React | 0.575 |
| **Déploiement** | Vercel (CI/CD automatique via GitHub) | — |
| **Cloud Functions** | Firebase Cloud Functions | — |

---

## 4. Architecture de l'application

### Structure des routes (App Router)

```
app/
├── page.tsx                                    # Landing page
├── (auth)/
│   ├── login/page.tsx                          # Connexion manager
│   ├── register/page.tsx                       # Inscription manager
│   └── forgot-password/page.tsx                # Réinitialisation mot de passe
├── (manager)/
│   └── dashboard/
│       ├── page.tsx                            # Dashboard manager (groupes, campagnes, optimisation)
│       └── actions.ts                          # Server actions (CRUD groupes, campagnes, optimisation)
├── join/[groupId]/
│   ├── page.tsx                                # Page d'invitation athlète
│   ├── join-form.tsx                           # Formulaire consentement + email (7 étapes)
│   ├── verify/page.tsx                         # Vérification email + profil (nom, adresses, contraintes)
│   └── actions.ts                              # Server actions (validation token, création athlète)
├── (athlete)/
│   ├── campaign/[campaignId]/
│   │   ├── page.tsx                            # Formulaire campagne (emploi du temps, adresses, contraintes)
│   │   └── actions.ts                          # Server actions (soumission, planning, suppression RGPD)
│   └── login/page.tsx                          # Connexion athlète
└── api/
    └── maps/distance/route.ts                  # Proxy Google Maps Distance Matrix (protège la clé API)
```

### Structure des fichiers lib

```
lib/
├── firebase/
│   ├── client.ts                               # SDK Firebase côté client
│   ├── admin.ts                                # SDK Firebase Admin (server-only)
│   └── auth.ts                                 # Contexte d'authentification
├── types/
│   ├── profile.ts                              # AddressWithCoords, ConstraintsGrid, AthleteProfile
│   ├── schedule.ts                             # WeeklySchedule, DayKey, dayLabels
│   ├── address.ts                              # AddressSchema (formulaire campagne)
│   ├── planning.ts                             # OptimizationResult, SlotResult, IndividualSlot
│   ├── athlete.ts, campaign.ts, manager.ts, group.ts
│   └── api.ts                                  # Types API
├── actions/
│   └── profile.ts                              # saveAthleteProfile, getAthleteProfile (encrypt/decrypt JSON)
├── utils/
│   ├── encryption.ts                           # Chiffrement AES-256-GCM des adresses
│   ├── travel.ts                               # Appel Google Maps Distance Matrix + cache Firestore
│   ├── departure.ts                            # Logique d'adresse de départ contextuelle
│   ├── email.ts                                # Templates email via Resend
│   └── maps-status.ts                          # Flag mode dégradé Google Maps
└── hooks/
    └── use-auth.tsx                            # Hook React pour l'état d'authentification Firebase
```

### Composants custom

```
components/custom/
├── app-header.tsx                              # Barre de navigation
├── step-progress.tsx                           # Indicateur de progression (étape X/N)
├── schedule-grid.tsx                           # Grille emploi du temps hebdomadaire
├── address-autocomplete-map.tsx                # Input Places Autocomplete + carte Google Maps + marqueur déplaçable
├── constraints-tap-grid.tsx                    # Grille 7j × 15h tactile tap-to-toggle (disponibilités)
├── optimization-result-view.tsx                # Visualisation résultats optimisation (manager)
├── travel-time-badge.tsx                       # Badge temps de trajet estimé
├── progress-ring.tsx                           # Anneau de progression circulaire
└── hero-section.tsx                            # Section héro landing page
```

---

## 5. Modèle de données (Firestore)

```
managers/
  {uid}/
    name, email, createdAt
    groups/
      {groupId}/
        name, createdAt, inviteToken, inviteTokenExpiresAt
        athletes/
          {athleteId}/
            email, firstName, lastName, hasProfile, gdprConsent, createdAt
        campaigns/
          {campaignId}/
            startDate, endDate, timeRangeStart, timeRangeEnd
            trainingLocation, status ("active"|"closed"), deadline, createdAt
            optimizationResult, planningStatus, planningStatusUpdatedAt
            responses/
              {athleteId}/
                schedule (WeeklySchedule)
                homeAddress (chiffré), schoolAddress (chiffré)
                constraints (texte)
                submittedAt
            travelTimes/
              {cacheKey}/
                durationMinutes, distanceKm, calculatedAt (TTL 7 jours)

athletes/
  {uid}/
    homeAddress (JSON chiffré: {formatted, lat, lng})
    schoolAddress (JSON chiffré: {formatted, lat, lng})
    clubAddress (JSON chiffré: {formatted, lat, lng})
    constraintsGrid (boolean[7][15])
    updatedAt
```

---

## 6. Fonctionnalités détaillées

### 6.1 Authentification

| Rôle | Méthode | Détail |
|------|---------|--------|
| **Manager** | Email / mot de passe | Inscription, connexion, réinitialisation |
| **Athlète** | Email link (magic link) | Zéro mot de passe, clic pour vérifier |

- Sessions de 24h (expiration automatique)
- Tokens d'invitation à durée limitée (30 jours)

### 6.2 Gestion des groupes (Manager)

- Créer un groupe nommé
- Générer un lien d'invitation partageable (UUID, expire après 30 jours)
- Régénérer le token (invalide l'ancien)
- Voir la liste des athlètes avec leur statut (inscrit / profil complet / incomplet)
- Retirer un athlète du groupe

### 6.3 Onboarding athlète (7 étapes)

| Étape | Page | Description |
|-------|------|-------------|
| 1/7 | join-form.tsx | Consentement RGPD (liste des données collectées) |
| 2/7 | join-form.tsx | Saisie email |
| 2/7 | join-form.tsx | Email envoyé (vérification) |
| 3/7 | verify/page.tsx | Prénom + Nom |
| 4/7 | verify/page.tsx | Adresse domicile (Google Maps + marqueur déplaçable) |
| 5/7 | verify/page.tsx | Adresse lieu d'études (Google Maps + marqueur déplaçable) |
| 6/7 | verify/page.tsx | Adresse club sportif (Google Maps + marqueur déplaçable) |
| 7/7 | verify/page.tsx | Grille de disponibilités (7j × 15h, tap-to-toggle) |

Chaque étape adresse affiche :
- Un input connecté à Google Places Autocomplete (restriction France, type adresse)
- Une carte interactive Google Maps (240px, zoom 15 après sélection)
- Un marqueur déplaçable qui met à jour l'adresse par reverse geocoding

### 6.4 Campagne de collecte (Manager)

**Création** : date de début/fin, plage horaire, lieu d'entraînement, deadline de réponse.

**Suivi en temps réel** : dashboard avec compteur X/N réponses, identification des non-répondants, animation pulse sur nouvelles réponses (via Firestore `onSnapshot`).

**Clôture** : empêche toute modification athlète, déclenche la phase d'optimisation.

### 6.5 Formulaire athlète (Campagne — 3 étapes)

| Étape | Contenu |
|-------|---------|
| 1/3 | Emploi du temps hebdomadaire (ScheduleGrid : Lun-Ven, heures de cours) |
| 2/3 | Adresses (domicile obligatoire + école optionnel, pré-remplis depuis le profil) |
| 3/3 | Contraintes spécifiques (texte libre, 2000 car. max, optionnel) |

Les données sont pré-remplies selon la priorité : réponse campagne existante > profil athlète > vide.

### 6.6 Moteur de calcul des temps de trajet

**Adresse de départ contextuelle** (`lib/utils/departure.ts`) :
- Pas de cours ce jour → départ du domicile
- Dernier cours finit avant le début du créneau → départ de l'école
- Cours pendant le créneau → indisponible (conflit)

**Calcul** (`lib/utils/travel.ts`) :
- Appel Google Maps Distance Matrix API (mode transit, langue française)
- Cache Firestore 7 jours (clé = SHA256 du couple origine/destination/jour)
- Adresses jamais stockées dans le cache (seulement le hash)
- Mode dégradé si Google Maps indisponible (l'app continue sans données trajet)
- Alerte si trajet > 2h (anomalie)

### 6.7 Algorithme d'optimisation

**Créneau collectif optimal** (`lib/utils/optimizer.ts`) :

1. Énumère tous les créneaux possibles (pas de 15 minutes) × tous les jours
2. Pour chaque combinaison créneau/jour, évalue chaque athlète :
   - Pas de conflit de cours + trajet compatible → disponible
   - Conflit de cours ou temps insuffisant → indisponible (avec raison)
3. Compte les athlètes disponibles, calcule le trajet moyen
4. Tri : max athlètes disponibles (desc) → min trajet moyen (asc)
5. Retourne le meilleur créneau avec le classement complet

**Créneaux individuels complémentaires** :

- Pour chaque athlète exclu du créneau collectif
- Recherche le meilleur créneau individuel (tous jours confondus)
- Critère : trajet le plus court parmi les créneaux sans conflit
- Inclut la raison d'exclusion et l'explication si aucun créneau trouvé

### 6.8 Visualisation et validation du planning

**Vue Manager** (`optimization-result-view.tsx`) :
- Meilleur créneau collectif : jour, horaire, taux de participation (ex: "15/20 = 75%")
- Statut par athlète : disponible / indisponible + raison détaillée
- Créneaux individuels pour les exclus
- Badge temps de trajet par athlète
- Boutons : Valider / Rejeter le planning

**Vue Athlète** (après validation) :
- Créneau assigné (collectif ou individuel)
- Jour, horaire, heure de départ contextuelle, estimation trajet
- Lieu d'entraînement
- Si aucun créneau : explication ("aucun créneau sans conflit de cours")

### 6.9 Notifications email

| Email | Déclencheur | Contenu |
|-------|-------------|---------|
| **Nouvelle campagne** | Création de campagne par le manager | Lieu, période, deadline, lien de réponse |
| **Planning publié** | Validation du planning par le manager | Type de créneau, horaires, trajet estimé, lien vers le planning |
| **Confirmation suppression** | Demande de suppression RGPD par l'athlète | Confirmation que toutes les données ont été supprimées |

Envoi via Resend, fire-and-forget (les erreurs ne bloquent pas le flux principal).

---

## 7. Sécurité et RGPD

### Chiffrement des données

- **AES-256-GCM** pour toutes les adresses au repos dans Firestore
- Les adresses sont stockées sous forme de JSON chiffré : `encrypt(JSON.stringify({formatted, lat, lng}))`
- Clé de chiffrement dans les variables d'environnement (Cloud Secret Manager en production)
- Seul le code serveur peut déchiffrer

### Isolation des données

- Règles de sécurité Firestore : chaque manager n'accède qu'à `/managers/{uid}/...`
- Le manager ne voit jamais les adresses des athlètes (seulement un badge "adresse fournie")
- Clé API Google Maps protégée par un proxy API côté serveur

### Consentement RGPD

- Formulaire de consentement explicite avant toute collecte de données
- Liste détaillée des données collectées et leur usage
- Case à cocher obligatoire "J'accepte la collecte et le traitement de mes données personnelles"

### Droit à la suppression

- Bouton "Supprimer mes données personnelles" accessible depuis la vue campagne athlète
- Suppression de : adresses chiffrées, emploi du temps, contraintes, compte Firebase Auth
- Email de confirmation envoyé avant suppression
- Action irréversible, avec double confirmation UI

### Fallback legacy

- `getAthleteProfile` gère la rétro-compatibilité : si le `JSON.parse` échoue (ancien format string), l'adresse est wrappée dans `{ formatted: str, lat: 0, lng: 0 }`
- Les données campagne (réponses) gardent le format string existant ; seul le profil `/athletes/{uid}` utilise le nouveau format JSON

---

## 8. Parcours utilisateurs

### Parcours Manager

1. **Inscription** → Créer un compte email/mot de passe
2. **Créer un groupe** → Nommer le groupe d'athlètes
3. **Partager le lien d'invitation** → Copier et envoyer via WhatsApp/email
4. **Attendre les inscriptions** → Suivre les profils complétés sur le dashboard
5. **Créer une campagne** → Définir dates, horaires, lieu, deadline
6. **Suivre les réponses** → Dashboard temps réel X/N réponses
7. **Clôturer la campagne** → Bloquer les modifications
8. **Lancer l'optimisation** → ~20 secondes → Résultat affiché
9. **Valider le planning** → Les athlètes reçoivent leur créneau par email
10. **Période d'entraînement** → Taux de présence amélioré grâce à la logistique

### Parcours Athlète

1. **Recevoir le lien d'invitation** → Cliquer
2. **Consentement RGPD** → Lire et accepter
3. **Saisir email** → Recevoir le lien magique
4. **Vérifier email** → Cliquer dans la boîte de réception
5. **Compléter le profil** → Nom, 3 adresses (avec carte), grille de disponibilités
6. **Recevoir un lien campagne** → Quand le manager crée une campagne
7. **Remplir le formulaire** → Emploi du temps, adresses (pré-remplies), contraintes
8. **Recevoir son planning** → Email avec créneau personnalisé + heure de départ
9. **Supprimer ses données** → À tout moment, bouton dédié (RGPD)

---

## 9. Performances et résilience

| Métrique | Objectif |
|----------|----------|
| Temps d'optimisation | < 30 secondes pour 20 athlètes (P95) |
| Chargement page | < 2.5s LCP sur 4G mobile |
| Appel Distance Matrix | < 2s par requête |
| Mise à jour temps réel dashboard | < 1s |
| Disponibilité | 99.5% uptime |

**Mode dégradé** : si Google Maps est indisponible, l'application continue de fonctionner sans les données de trajet. L'utilisateur est notifié et les résultats d'optimisation excluent le critère trajet.

---

## 10. Déploiement

| Service | Plateforme | URL |
|---------|------------|-----|
| Application Next.js | Vercel | https://slot-training-alpha.vercel.app |
| Base de données + Auth | Firebase (Firestore + Auth) | Console Firebase |
| Emails transactionnels | Resend | — |
| APIs Google Maps | Google Cloud Platform | — |

Le déploiement est automatique : chaque push sur la branche principale déclenche un build Vercel.

---

## 11. Évolutions prévues

### V1.1
- Trafic dynamique par heure (pas seulement par jour de la semaine)
- Tests A/B : recommandations "avec trajet" vs "sans trajet"

### V2
- Dashboard analytics multi-campagnes
- Export vers Google Calendar / iCal
- Notifications push
- API d'intégration

### V3
- Licence multi-structure (clubs, fédérations)
- Rôles directeur / superviseur
- Application mobile native
- RBAC avancé

---

## 12. Différenciateurs clés

1. **Temps de trajet réels comme variable de premier ordre** — Seul Slot Training intègre la logistique de déplacement dans l'optimisation ; les concurrents (Doodle, TeamSnap, WhatsApp) l'ignorent
2. **Adresse de départ contextuelle** — Le système sait si l'athlète part du domicile ou de la fac selon le jour
3. **Collecte unique** — Un seul lien collecte toutes les contraintes de tous les athlètes
4. **Algorithme transparent** — Chaque décision est expliquée au manager et à l'athlète
5. **Zéro friction athlète** — Inscription par lien magique, pas de mot de passe, formulaire mobile-first en quelques minutes
