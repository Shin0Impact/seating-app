# طاولتنا / Our Table

Wedding-hall seating for a planner and their guests. Draw the hall to scale, seat guests at chairs, send each guest a private RSVP link with a QR code, and check people in at the door.

Arabic (right-to-left) is the default language; English is one tap away.

Stack: Next.js 16, React 19, TypeScript, Konva (canvas), Supabase (Postgres, Auth, RLS), deployed on Vercel.

## Features

**Hall editor**

- Round and rectangular tables, half tables against a wall, columns, raised areas with steps, and markers (stage, dance floor, entrance, buffet, emergency exit, walkway).
- Everything is drawn in meters. Table size follows the chair count (adjustable under sizing settings). Overlap and minimum-walkway warnings.
- Drag, rotate (15 degree snap), multi-select, undo/redo, copy tables, right-click or long-press menus, quick-table presets that learn what you use.
- Drag guests onto chairs, or pick a chair and choose a guest. Chairs show initials and group colors.
- JSON export/import (validated and clamped on load).

**Guests**

- Add one at a time, paste a list, or import CSV/Excel with automatic column detection. Arabic-aware search and duplicate detection.
- Groups, step-free access flag, table and chair assignment, jump-to-chair from the list.

**Invites and RSVP**

- One secret link per named guest ("Name +1" entries are folded into the invite). Share by WhatsApp or download a CSV.
- Guests open the link without logging in, confirm how many are coming, request changes, and get a QR code and a map to their seat. They never see other guests.
- Planners approve or reject change requests.
- Planner-only guess per invite of who will come: how many are sure (أكيد), how many maybe (ممكن), the rest a courtesy invite (واجب). The family's own answer replaces the guess. Totals, chairs needed against the hall's chairs, filters, dashed "maybe" chairs on the plan, and an optional import column. Guests and the door scanner never see it.

**Door check-in**

- The scanner reads the QR on a phone and shows the table and chair. Repeat scans and unconfirmed guests are flagged.

**Accounts and safety**

- Email and password accounts; each planner sees only their own events (row-level security).
- Saves are debounced and version-checked, so a stale tab cannot overwrite newer work.
- Daily automatic backups with a restore page.

## Run it

Needs Node.js 20 or newer.

```
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run typecheck
npm run build
```

Copy `.env.example` to `.env.local` and fill it in. The offline editor at `/editor` works without Supabase.

## Setup

1. Create a Supabase project. In the SQL editor run the files in `supabase/migrations/` in order, `0001` to `0010`.
2. For backups, enable the `pg_cron` extension (Database, Extensions) before running `0009_backups.sql`.
3. Supabase, Authentication, URL configuration: set the Site URL to your deployed address and add `https://YOUR-APP.vercel.app/**` to the redirect URLs.
4. Import the repo into Vercel and set the environment variables below. The build command stays `npm run build`.
5. Open the site, go to `/login`, create an account, confirm the email, and create an event.

| Variable                               | Purpose                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project URL                                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (the older `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works) |
| `NEXT_PUBLIC_SITE_URL`                 | Public address, used to build invite links                             |

## Layout

- `src/app`: routes (planner pages under `events/`, guest page under `r/[token]`, offline editor under `editor/`)
- `src/components`: editor, guest list, invites, scanner, hall preview
- `src/lib`: layout model and parsing, route finding, invites, i18n (`i18n.ts` for the editor, `site-i18n.ts` for the rest), CSV/Excel import, Arabic search
- `supabase/migrations`: schema, security-definer RPCs for the guest page, backups
