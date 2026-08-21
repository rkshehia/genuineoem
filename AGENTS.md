# AGENTS.md

Overview of this codebase for developers and AI agents.

## Project Overview

A terminal/hacker-styled site for GENUINE_OEM, a UK-based reseller of genuine BMW and Land Rover OEM parts with delivery into Kenya. Visitors file a part enquiry through `request_quote.exe`, receive a quote reference, and use `access_quote.sh` to open their record. An admin prices each request in a password-gated console; publishing the quote is what makes it visible to the customer.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start |
| Frontend | React 19, TanStack Router v1 |
| Build | Vite 7 |
| Styling | Plain CSS (`src/styles.css`) + Tailwind CSS 4 available |
| Forms | Netlify Forms (notification emails only) |
| Data | Netlify Database (Postgres) via Drizzle ORM |
| Files | Netlify Blobs (part photos) |
| API | Netlify Functions |
| Language | TypeScript 5.9 |
| Deployment | Netlify |

## Directory Structure

```
├── db
│   ├── index.ts               # Drizzle client (Netlify Database adapter)
│   └── schema.ts              # quote_requests + quotes tables
├── netlify
│   ├── database/migrations    # Applied automatically at deploy time
│   ├── functions              # API: quote-request, quote-lookup, admin-*, part-image
│   └── lib                    # Shared server helpers (auth, ref codes, json)
├── public
│   ├── favicon.ico
│   ├── placeholder.png
│   └── quote-form.html        # Static skeleton so Netlify's build bot detects the forms
├── src
│   ├── components
│   │   ├── QuoteForm.tsx      # request_quote.exe — stores the request, returns a reference
│   │   └── QuoteFollowUp.tsx  # Reply box on the access page, posts to Netlify Forms
│   ├── lib                    # api endpoints, quote types/formatters, ref normalisation
│   ├── routes
│   │   ├── __root.tsx         # Root layout: fonts, meta, global styles
│   │   ├── access.$ref.tsx    # access_quote.sh — the customer's quote record
│   │   ├── admin.tsx          # Password-gated quote desk
│   │   └── index.tsx          # The landing page (terminal UI, capabilities, quote form)
│   ├── router.tsx
│   └── styles.css             # Tailwind import + terminal theme styles (.goem-*)
├── drizzle.config.ts
├── netlify.toml
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Key Concepts

### Routing

File-based routing via TanStack Router: `/` (landing), `/access/$ref` (customer quote record), `/admin` (quote desk). The last two are `noindex`.

API calls go to the reserved `/.netlify/functions/*` paths — see `src/lib/api.ts`. Do not give these functions a custom `config.path`: the TanStack Start SSR handler owns every other route and swallows the request before it reaches the function.

### Quote lifecycle

1. `request_quote.exe` POSTs to `quote-request`, which writes a `quote_requests` row and mints the `GO-XXXX-XXX` reference server-side.
2. The reference is the customer's only credential. `access_quote.sh` validates it on the landing page, then opens `/access/$ref`.
3. Until an admin publishes, `quote-lookup` returns `status: processing` and the page reports that the order is still being processed.
4. Publishing from `/admin` writes a `quotes` row (via `admin-quote`); its existence is the published flag, and the customer immediately sees part details, photo and landed cost.

### Admin access

The console is gated by a single shared password in the `ADMIN_PASSWORD` environment variable, exchanged for a signed, HttpOnly session cookie (12h). With the variable unset the admin API returns 503 and the console stays locked — it never falls open.

### Deleting a request

`admin-request` handles `DELETE ?ref=GO-XXXX-XXX`: it removes the enquiry, its quote row and the part photo, mainly so test records can be cleared. The deletion is unrecoverable and breaks the customer's access link, so the console asks for a second click before sending it.

### Part photos

Uploaded to Netlify Blobs (`part-images` store) and served back through the `part-image` function, keyed by quote reference rather than blob key. Max 4MB, to stay under the 6MB function payload limit.

### Database changes

Schema lives in `db/schema.ts`. After any change run `npx drizzle-kit generate --name <change>`; migrations land in `netlify/database/migrations/` and Netlify applies them during the deploy. Never apply them by hand.

### Netlify Forms

Forms are now a notification channel, not the system of record — the database is. A form POST that fails does not lose the request.

Submissions are also read back into `/admin` by the `admin-submissions` function, which calls the Netlify API. That needs `NETLIFY_API_TOKEN` set to a personal access token; without it the inbox panel reports itself unconfigured and the rest of the console carries on. Follow-up replies are matched to a request by their `quote_ref` field and shown on that request's card.

Submissions go via AJAX (`fetch` with `application/x-www-form-urlencoded`). Because Netlify's build-time form detection only scans static HTML, `public/quote-form.html` contains a hidden mirror of every field, and field names must stay in sync with the React components. Form submissions don't work in local dev — test on a deploy preview.

### Styling

Custom terminal-styled classes prefixed `goem-` live in `src/styles.css`. Tailwind is wired up via `@tailwindcss/vite` if further utility classes are needed.

## Development Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
```

Set `ADMIN_PASSWORD` in the environment to unlock `/admin` locally, and `NETLIFY_API_TOKEN` if you also want the forms inbox to load. Database queries need a provisioned branch, so the full flow only works on a deploy preview.
