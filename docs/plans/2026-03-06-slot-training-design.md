# Slot Training - Design Document

## Date: 2026-03-06

## Overview

Slot Training is a web application that replaces manual coordination (WhatsApp, spreadsheets) for sports managers scheduling training sessions with groups of student-athletes. It collects schedules, calculates real travel times via Google Maps, determines contextual departure addresses, and optimizes collective training slots.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| Language | TypeScript strict |
| Styles | Tailwind CSS 4 + shadcn/ui |
| Validation | Zod |
| Forms | React Hook Form |
| Auth | Firebase Auth (email/password managers, email link athletes) |
| Database | Cloud Firestore via Firebase Admin (server-side) |
| Emails | Resend |
| Maps | Google Maps APIs via @vis.gl/react-google-maps |
| Toasts | Sonner |
| Icons | Lucide React |
| Deployment | Vercel |

## Architecture

### Server-Side First

- Server Components by default for all pages
- Server Actions for all mutations (CRUD groups, campaigns, optimization, GDPR deletion)
- Client Components only when needed ("use client"):
  - Interactive forms (React Hook Form)
  - Google Maps (map, autocomplete, draggable marker)
  - Real-time dashboard (Firestore onSnapshot for response counter)
  - Tap-to-toggle grid (availability)
- API Route: `/api/maps/distance` as Google Maps proxy (protects server key)

### Route Structure

```
app/
├── page.tsx                              # Landing page (Server Component)
├── (auth)/
│   ├── login/page.tsx                    # Manager login
│   ├── register/page.tsx                 # Manager registration
│   └── forgot-password/page.tsx          # Password reset
├── (manager)/
│   └── dashboard/
│       ├── page.tsx                      # Dashboard (groups, campaigns)
│       └── actions.ts                    # Server Actions
├── join/[groupId]/
│   ├── page.tsx                          # Athlete invitation
│   ├── join-form.tsx                     # 7-step form (client)
│   ├── verify/page.tsx                   # Email verification + profile
│   └── actions.ts                        # Server Actions
├── (athlete)/
│   ├── campaign/[campaignId]/
│   │   ├── page.tsx                      # Campaign form (3 steps)
│   │   └── actions.ts                    # Server Actions
│   └── login/page.tsx                    # Athlete login
└── api/
    └── maps/distance/route.ts            # Google Maps proxy
```

## Data Model (Firestore)

```
managers/{uid}
  ├── name, email, createdAt
  └── groups/{groupId}
        ├── name, createdAt, inviteToken, inviteTokenExpiresAt
        ├── athletes/{athleteId}
        │     ├── email, firstName, lastName, hasProfile, gdprConsent, createdAt
        └── campaigns/{campaignId}
              ├── startDate, endDate, timeRangeStart, timeRangeEnd
              ├── trainingLocation: { formatted, lat, lng }
              ├── status: "active" | "closed"
              ├── deadline, createdAt
              ├── optimizationResult, planningStatus, planningStatusUpdatedAt
              ├── responses/{athleteId}
              │     ├── schedule (WeeklySchedule)
              │     ├── homeAddress (encrypted AES-256-GCM)
              │     ├── schoolAddress (encrypted AES-256-GCM)
              │     ├── constraints, submittedAt
              └── travelTimes/{cacheKey}
                    ├── durationMinutes, distanceKm, calculatedAt (TTL 7 days)

athletes/{uid}
  ├── homeAddress (encrypted JSON)
  ├── schoolAddress (encrypted JSON)
  ├── clubAddress (encrypted JSON)
  ├── constraintsGrid: boolean[7][15]
  └── updatedAt
```

## Features

### Authentication
- Manager: email/password (register, login, reset)
- Athlete: magic link (zero password)
- 24h session cookies (HttpOnly, Secure, SameSite=Lax)
- Next.js middleware for route protection

### Group Management (Manager)
- Create named groups
- Generate shareable invite link (UUID token, 30-day expiry)
- Regenerate token (invalidates previous)
- View athletes with status (registered / profile complete / incomplete)
- Remove athlete from group

### Athlete Onboarding (7 steps)
1. GDPR consent
2. Email input
3. Magic link sent (waiting screen)
4. First name + Last name
5. Home address (Google Places + map + draggable marker)
6. School address (same)
7. Availability grid (7d x 15h, tap-to-toggle)

### Campaign Management (Manager)
- Create: start/end dates, time range, training location (Google Maps), deadline
- Real-time tracking: X/N responses via onSnapshot, non-respondent identification, pulse animation
- Close: blocks athlete modifications, triggers optimization phase

### Athlete Campaign Form (3 steps)
1. Weekly schedule (ScheduleGrid: Mon-Fri, class hours)
2. Addresses (home + school, pre-filled from profile)
3. Specific constraints (free text, 2000 char max)

### Optimization Engine
- Contextual departure address (home vs school based on class schedule)
- Enumerate all slots (15-min steps) x all days
- Evaluate each athlete: course conflict + travel compatibility
- Sort: max available athletes (desc) -> min average travel (asc)
- Individual complementary slots for excluded athletes
- Google Maps Distance Matrix via proxy, Firestore cache 7 days
- Degraded mode if Google Maps unavailable

### Planning Visualization
- Manager view: best collective slot, participation rate, per-athlete status with reasons, Validate/Reject buttons
- Athlete view: assigned slot, departure time, travel estimate, location, or explanation if none

### Email Notifications (Resend)
- New campaign -> athletes
- Planning published -> athletes with personalized slot
- GDPR deletion confirmation -> athlete

### GDPR Compliance
- Explicit consent form before data collection
- "Delete my data" button in athlete view
- Deletes: encrypted addresses, schedule, constraints, Firebase Auth account
- Double confirmation UI + confirmation email
- Irreversible action

## Security
- AES-256-GCM encryption for all addresses at rest
- Manager never sees athlete addresses (only "address provided" badge)
- Travel cache stores SHA256 hash of origin/destination, never addresses
- Firestore Rules: each manager accesses only /managers/{uid}/...
- Google Maps API key protected by server-side proxy
- Encryption key in environment variables

## File Structure

```
lib/
├── firebase/
│   ├── client.ts          # Client SDK (App, Auth, Firestore)
│   ├── admin.ts           # Firebase Admin (server-only)
│   └── auth.ts            # Auth helpers (session cookie, middleware)
├── types/
│   ├── profile.ts, schedule.ts, address.ts, planning.ts
│   ├── athlete.ts, campaign.ts, manager.ts, group.ts, api.ts
├── actions/
│   └── profile.ts         # saveAthleteProfile, getAthleteProfile
├── utils/
│   ├── encryption.ts      # AES-256-GCM
│   ├── travel.ts          # Google Maps Distance Matrix + cache
│   ├── departure.ts       # Contextual departure address
│   ├── optimizer.ts       # Slot optimization algorithm
│   ├── email.ts           # Email templates via Resend
│   └── maps-status.ts     # Google Maps degraded mode flag
└── hooks/
    └── use-auth.tsx        # React auth state hook

components/custom/
├── app-header.tsx, step-progress.tsx, schedule-grid.tsx
├── address-autocomplete-map.tsx, constraints-tap-grid.tsx
├── optimization-result-view.tsx, travel-time-badge.tsx
├── progress-ring.tsx, hero-section.tsx
```

## Visual Design
- Palette: shadcn/ui default (zinc/slate) with blue-600 accent
- Typography: Inter (next/font/google)
- Responsive: mobile-first (athlete forms optimized for smartphone)
- No dark mode in V1

## Performance Targets
- Optimization: < 30s for 20 athletes (P95)
- Page load: < 2.5s LCP on 4G mobile
- Distance Matrix call: < 2s per request
- Real-time dashboard update: < 1s
- Availability: 99.5% uptime
