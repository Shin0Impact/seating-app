# Hall seating app: layout editor (step 1)

First piece of the wedding seating app: a table-first hall layout editor. No hall outline is needed. You place tables, columns, a raised area and markers (stage, dance floor, entrance, buffet) on a free canvas drawn to real scale in meters.

## Run it

Needs Node.js 20 or newer.

```
npm install
npm run dev      # http://localhost:3000
npm test         # unit tests for sizing, overlap checks and file validation
npm run build    # production build
```

## What it does

- Round and rectangular tables. Size comes from the chair count (default 0.6 m of table edge per chair; adjustable under "Sizing settings").
- Round or square support columns with adjustable size.
- Raised area with a step count (drawn as step lines along its bottom edge; rotate it to put the steps where they are).
- Stage, dance floor, entrance, buffet and other markers.
- Warnings: red when tables (with chairs) overlap each other or a column, amber when less than the minimum walkway is left between them.
- Drag to move, rotate handle (snaps every 15 degrees), scroll to zoom, drag empty space to pan, Fit view.
- Undo (Ctrl+Z), Delete key, duplicate.
- Arabic (right-to-left, default) and English. The Arabic strings are a first draft in `src/lib/i18n.ts`; please review them.
- **Guests tab:** add guests one by one (Enter adds the next), or paste several names at once, one per line. Each guest has a name, a group, an optional table and a "needs step-free access" flag. Names, groups and tables can be edited in place. Search ignores Arabic spelling variants (أ/ا, ة/ه, ى/ي, diacritics). Tables show seated/chairs (for example 7/10) and turn red when there are more guests than chairs.
- **Seating at chairs:** drag a guest by the handle in the Guests tab onto a chair (the target chair lights up), or drop on a table to take its first free chair. Drag a seated guest's chair to another chair to move or swap. Dropping on a taken chair swaps the two guests. Chairs show the guest's initial, a color per group, and the full name on hover. Each guest also has a Chair dropdown (works on touch screens). Chairs are numbered from the top clockwise on round tables, and left to right along the top then the bottom on rectangular tables.
- **Double-click a chair** to open a list of your invited guests (search, or type a new name and add and seat them). Pick one to seat them there; the guest who was there is moved out. An "Empty this chair" button clears it.
- **Quick tables bar** (under the title): click a preset (round 6/8/10/12, rectangular 8/10/12 chairs) to add it in a free spot, or drag it onto the hall. **Copy table** duplicates the selected table with the same chairs (no guests); the Copies field makes several in a row.
- **Zoom** shows more of each guest's name on their chair: an initial when zoomed out, the first name, then the full name as you zoom in.
- **Presets learn:** the quick-table chips are ordered by what you actually add (presets, Add buttons, copies). Sizes you use that aren't on the list, like a 9-chair table, join it; the 7 most used are shown. Saved in this browser.
- **Right-click or press and hold** (touch): on a table for Copy table, Rotate 90°, Remove all guests, Delete; on a chair to seat or change its guest or empty it; on empty floor to add a table or column right there, or select all.
- **Select several:** Shift+drag a box on empty floor, or turn on the select tool (dashed-box button beside Fit) and just drag. Shift/Ctrl+click adds or removes one, Ctrl+A selects all. Drag any selected item and the whole group moves together; copy, rotate (as a group) and delete work on all of them.
- **Import a guest list (Guests tab → Import list):** choose a CSV file or paste cells copied from Excel/Google Sheets. Handles commas, semicolons or tabs, and Arabic/Hebrew files saved by Excel (UTF-8 or Windows-1256/1255). Columns are guessed from the headers (English or Arabic); you can change them. You pick which column is the name (optional surname, group/family, number of people, table). A number of people above 1 adds "Name +1", "Name +2"…. Names already in the list (spelling variants included) are skipped. A preview shows what will be added before anything changes. Excel files: use File → Save As → CSV.
- **Three views** (switch at the top): **Hall** (canvas, palette, properties, guests waiting for a seat), **Guests** (a full-page list to look through, search, filter by group or seated state, add, edit and import) and **Table sizes** (the sizing rules with live examples, plus every table's name, shape and chair count in one list, set chairs on all tables at once, jump to a table in the hall).
- **Everything can be dragged in:** each item in the hall's palette (round/rectangular table with the chair count above it, round/square column, raised area, stage, dance floor, entrance, buffet, other) can be dragged onto the hall and lands where you release it, or clicked to add in a free spot. Guests in the "Guests to seat" list drag onto chairs.
- Standard icons for undo, redo, export, import, duplicate, delete and fit view. Arabic uses the bundled Noto Sans Arabic font at a larger size.
- Saves automatically in this browser. Export and import a `.json` file; imports are validated and clamped before use.

## Demo page

`npm run build:demo` bundles the editor into one self-contained file, `demo/dist/index.html` (scripts, styles and fonts inline, opens with an example hall). It can be hosted anywhere as a static page. In a hosted viewer that blocks downloads, the Export button does nothing.

## Not built yet

Accounts, database (Supabase), auto-seating, guest links, attendance colors and check-in, printing. Layout data already has the shape the database will store (`src/lib/layout.ts`).

## Layout

- `src/lib/layout.ts`: model, table sizing, overlap geometry, safe file parsing
- `src/lib/layout.test.ts`: unit tests
- `src/lib/i18n.ts`: Arabic and English strings
- `src/components/Editor.tsx`: canvas, side panel, undo/redo, save and load
- `src/components/GuestsView.tsx`: full-page guest list (add, edit, search, filter, import)
- `src/components/TablesView.tsx`: table sizes and per-table metrics
- `src/components/SeatList.tsx`: draggable guest list in the hall view
- `src/components/ImportGuests.tsx`, `src/lib/csv.ts`: CSV/paste import
- `src/components/Icon.tsx`: standard icons
- `src/lib/search.ts`: Arabic-aware name matching
- `src/components/ElementNode.tsx`: how each element is drawn

## Going online (Supabase + Vercel)

The offline editor at `/` keeps working with no setup. The online parts (planner login, saved events, guest RSVP links with QR codes, door scanning) need a free Supabase project and a Vercel deployment.

**How it works**
- Planners sign up and log in with email and password (Supabase Auth). Each planner only ever sees their own events (row-level security).
- An event stores the whole hall plan (`events.layout`, the same JSON the editor already uses). Saves are debounced and version-checked, so a stale tab cannot overwrite a newer save.
- "Invites" creates one secret link per named guest ("Name +1" guests are folded into the named guest's invite). Send the link by WhatsApp (the CSV download has name + link).
- The guest opens the link (no login), confirms how many are coming, and gets a QR code. Guests never see the plan, other guests or their table.
- On the day, a planner account opens "Scan" on a phone, scans the QR, and sees the guest's table and chair. Scanning twice shows a warning; guests who never confirmed are flagged.

**Setup, once**
1. Supabase: create a project. SQL editor → paste `supabase/migrations/0001_init.sql` → Run.
2. Supabase → Authentication → URL configuration: set Site URL to your Vercel address (after step 4) and add `https://YOUR-APP.vercel.app/**` to the redirect URLs.
3. Push this folder to a new GitHub repository (`.env*.local` is already git-ignored).
4. Vercel → Add New Project → import the repo. Add environment variables from `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`) → Deploy. Build command stays `npm run build`.
5. Open the site, go to `/login`, create an account, confirm the email, then create an event.

For local development copy `.env.example` to `.env.local` and fill it in.

**Not done yet (planned):** rate limiting on the public RSVP page, separate door-staff logins, auto-seating, printing. The anon key in the browser is normal for Supabase; never put the `service_role` key in this project.
