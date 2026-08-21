# GENUINE_OEM // Parts Access

A landing page for a UK-based reseller of genuine BMW and Land Rover OEM parts, with delivery into Kenya. The page uses a terminal/hacker-styled interface and includes a quote request form so visitors can submit a part number and vehicle details to receive a quote.

## Tech stack

- [TanStack Start](https://tanstack.com/start) (React 19 + TanStack Router)
- Vite 7
- Netlify Forms for the quote request submission
- Deployed on Netlify

## Running locally

```bash
npm install
npm run dev
```

The dev server runs on port 3000. Note that Netlify Forms submissions only work on a deployed site (Netlify's form processing is part of the CDN/build pipeline), so the quote form won't successfully submit in local dev — everything else on the page can be previewed locally.

## Project structure

See [AGENTS.md](./AGENTS.md) for a full breakdown of the codebase.
