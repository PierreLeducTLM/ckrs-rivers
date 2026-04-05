# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — Start development server (http://localhost:3000)
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run lint` — Run ESLint (flat config, ESLint 9)

## Tech Stack

- **Next.js 16.2.2** (App Router) with React 19 and TypeScript
- **Tailwind CSS 4** via `@tailwindcss/postcss` (uses `@import "tailwindcss"` and `@theme inline` syntax, not v3-style `@tailwind` directives or `tailwind.config.js`)
- **Geist** font family (sans + mono) loaded via `next/font/google`
- Path alias: `@/*` maps to project root

## Architecture

This is a fresh Next.js App Router project. All routing uses the `app/` directory:
- `app/layout.tsx` — Root layout with fonts and dark mode support
- `app/page.tsx` — Home page (server component)
- `app/globals.css` — Global styles with Tailwind v4 theme config

## Important: Next.js 16 Breaking Changes

This project uses Next.js 16 which has breaking changes from earlier versions. **Always consult `node_modules/next/dist/docs/` before writing code** — especially:
- `node_modules/next/dist/docs/01-app/` for App Router docs
- `node_modules/next/dist/docs/01-app/03-api-reference/` for API reference

Do not rely on training data for Next.js APIs, conventions, or file structure.
