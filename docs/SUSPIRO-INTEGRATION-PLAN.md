# Suspiro del Mar: integration plan

Goal: one source of truth for availability across **Airbnb**, **Booking.com**
and the **suspirodelmar.com** React website, built on this codebase
(a fork of RentTools.io, MIT).

## How the pieces fit

```
 Airbnb ──iCal export──┐                         ┌──► for-airbnb.ics  ──► Airbnb (import)
                       ├──► Sync hub (this app) ─┼──► for-booking.ics ──► Booking.com (import)
 Booking ─iCal export──┘   sync.suspirodelmar.com└──► JSON availability API ──► React site
                                   ▲
           direct booking requests ┘  (from the website, phase 3)
```

What the code already does:

- **Import.** `CalendarLink` rows hold each platform's iCal export URL.
  `src/lib/calendar-sync.ts` pulls them through the cron route
  `src/app/api/calendar/cron` (every 10 min) into `CalendarEvent`.
- **Export.** `src/app/api/calendar/feed/[propertyId]/for-<platform>.ics`
  (`src/lib/feed.ts`) gives each platform a feed of everything *except* its own
  bookings. That covers the other OTA's bookings, manual/direct reservations,
  closed `DateOverride`s and buffer days.
- **Manual reservations.** `Reservation` with `platform: "direct"` is
  exported to both OTAs, so a website booking keeps working once it is
  written here.

What's missing for the website: a **public, read-only JSON availability
endpoint** (the website shouldn't parse iCal), CORS, and later an endpoint
for **booking requests**.

## Phase 0: make it our own repository (done: `saintgermainlabs/booking-sync`)

1. Create a standalone **private** repo (for example
   `saintgermainlabs/suspiro-sync`). A GitHub fork of a public repo can't be
   private, and PRs from it default to the upstream repo. Push this history
   into it.
2. Keep `LICENSE` (the MIT terms require keeping the copyright notice). Update
   `package.json` `name`/`repository`/`homepage` and the README.
3. Track upstream as a second remote (`upstream` →
   `Gribadan/RentTools.io`) so we can still cherry-pick sync fixes.

## Phase 1: stand up the sync hub (no website changes yet)

1. **Deploy** to `sync.suspirodelmar.com` (or `admin.`), using
   `docs/DOCKER-DEPLOYMENT.md` or `docs/DROPLET-SETUP.md`. Set
   `JWT_SECRET` (the middleware falls back to an insecure default), a
   database path with backups, and the cron job in `deploy/cron`.
2. **Single-tenant hardening** (done, private mode; see the README): turn off public signup, Google One Tap and the
   marketing/blog pages (`/`, `/blog`, `/onboard`, sitemap, `llms.txt`).
   Redirect `/` to `/login`. Remove the Gemini passport OCR unless we want it.
   The Croatian eVisitor module doesn't apply here (see the note at the end).
3. **Configure the property:** check-in/out times, `minNights`, buffers
   (`bufferBefore/After`, probably 0 unless we need a cleaning day) and
   `feedToken`, so the feeds aren't guessable.
4. **Connect the OTAs:**
   - Airbnb → *Calendar → Availability → Sync calendars → Export*: paste the
     URL as a `CalendarLink` with platform `airbnb`.
   - Booking.com extranet → *Rates & Availability → Sync calendars → Export*:
     add it as `booking`.
   - Paste `…/for-airbnb.ics` into Airbnb's *Import* and `…/for-booking.ics`
     into Booking's *Import*.
5. **Verify:** block a test date on Airbnb, then check it shows up in the
   dashboard and in Booking.com within a few hours. Remember the OTAs only
   poll every 2–6 h.

## Phase 2: show live availability on suspirodelmar.com

**Backend (this repo).** Add
`GET /api/public/availability/[feedSlug]?from=YYYY-MM-DD&to=YYYY-MM-DD`:

- It returns only dates, never guest data:
  ```json
  { "property": "Suspiro del Mar", "minNights": 2,
    "checkIn": "15:00", "checkOut": "11:00",
    "unavailable": ["2026-10-12", "2026-10-13"],
    "noCheckIn": ["2026-10-20"], "updatedAt": "…" }
  ```
- Reuse the same merge logic as `generateFeed` (events + reservations +
  closed overrides − open overrides + buffers). Factor the date computation
  out of `feed.ts` into a shared function so the website and the OTAs can't
  disagree.
- CORS allowlist: `https://suspirodelmar.com`, `https://www.suspirodelmar.com`
  and `http://localhost:5173` (and/or `:3000`) for dev. Add a
  `Cache-Control: public, max-age=300` header and rate-limit with
  `checkRateLimit` (`src/lib/rate-limit.ts`).
- Add the path to the middleware's public allowlist, plus tests next to
  `feed.test.ts`.

**Frontend (`/home/god/websites/suspiros`).**

- Add `VITE_SYNC_API_URL` (or `NEXT_PUBLIC_…`, depending on the stack).
- Add a small `useAvailability(from, to)` hook (fetch, or TanStack Query if
  it's already there).
- Add an availability calendar component (`react-day-picker` is light) that
  disables `unavailable` dates and enforces `minNights`. Show a "Book on
  Airbnb / Booking.com" CTA with deep links to the listings, plus a "Request
  direct booking" button for phase 3.
- Handle loading and failures: if the API is down, show the CTA links rather
  than an empty calendar.

## Phase 3: direct booking requests from the website

1. Add `POST /api/public/booking-requests` with `{ checkIn, checkOut, guests,
   name, email, phone, message }`. Protect it with Cloudflare Turnstile, the
   rate limiter and server-side re-validation against availability.
2. Store a request as a `Reservation` with `platform: "direct"` and a new
   `status` field (`pending` | `confirmed` | `declined`). This needs a schema
   change in `prisma/schema.prisma` and `prisma/push-schema.ts`.
3. Decide whether **pending holds block the OTAs**. Recommended: yes, for a
   short TTL (for example 24 h). The OTA poll delay (2–6 h) is the real
   double-booking risk, so blocking early is safer.
4. Email the owner (`src/lib/email.ts`) and add a confirm/decline action in
   the dashboard. Confirming sends the guest an email and keeps the dates
   blocked; declining or expiring frees them.
5. Optional later: a Stripe Checkout deposit on confirmation, and seasonal
   pricing on the website.

## Phase 4: ops

- Uptime check on `/api/health`, plus the existing sync alerts banner. Email
  alerts when a `CalendarLink` keeps failing (`failureCount`).
- Daily SQLite backups (already in the droplet runbook).
- Keep a small upstream-merge routine for calendar-sync fixes.

## Open questions

- What does the React site run on (Vite SPA, Next.js, or something else), and
  where is it hosted? This decides env-var naming and whether we can proxy
  `/api/availability` through the site's own domain, which avoids CORS.
- Is it one unit or several? Each unit is a `Property` with its own feeds.
- Do we want direct bookings (phase 3), or only the availability display?
- Guest registration: the eVisitor module is Croatia-specific. If the
  property is in Spain, the equivalent is SES.HOSPEDAJES, which would be a
  separate future module.
