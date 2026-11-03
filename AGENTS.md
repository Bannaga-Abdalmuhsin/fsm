# App — Agent Guide

This starter ships as a blank Agent-Native app canvas — that describes its
initial state, not necessarily its current one. See `DEVELOPING.md` before
making any source code change.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

This repo is a single standalone app (`agent-native.scaffold.shape:
"standalone"`), not a workspace root. If the user asks for a workspace, a
platform or suite of apps, a second app, an app shell or launcher, or Dispatch,
read the `multi-app-workspace` skill before touching the repo layout.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. The default home view is
  `home` at `/` (blank app canvas). No agent rail or chat is mounted by
  default; add one only when the user asks.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Building a domain app

Choose the primary workflow and route before editing. Build on the blank canvas in `app/routes/_index.tsx` or add domain routes under `app/routes/`. This starter has no Chat route, sidebar, header, or agent rail; add only the navigation the product needs. Set `app.homePath` in the existing `defineAppConfig` in `server/plugins/config.ts` as `DEVELOPING.md` describes.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here and update `README.md` as `DEVELOPING.md` describes. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow and its authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.

## Native PMR workflow

`mobile/` is a separate native Expo app using Supabase JWT/RPCs, not Agent-Native web auth. Native mutations go through the named API helpers in `mobile/src/api.ts` and authoritative SQL workflow functions. Never route native PMR data to the legacy web database or ship a service key.

Primary operations: `pmr_membership`, `pmr_open_order`, `pmr_check_in`, `pmr_start_work`, `pmr_begin_capture`, `pmr_record_etl_result`, `pmr_submit_order`, `pmr_review_photo`, `pmr_review_result`, `pmr_review_order`, `pmr_grant_gallery_approval`, `pmr_set_team_member`, `pmr_promote_ready_schedules`, `pmr_save_quality_policy`. Photos use JWT-authenticated `evidence-ingest`; analysis retries use its JSON reanalyze operation. Preserve explicit pending/failed states. Release gates are in `docs/RELEASE_READINESS.md`.

Remote admin tests use `pmr_create_admin_test` and the immutable `inventory.admin_test` marker. Never apply a test distance exception to an operational WO or hide test markings. Test orders cannot be submitted/approved.

## Office PMR portal

The web office portal shares the native Supabase JWT/RLS source of truth. Use named helpers in `app/lib/office-api.ts` and the corresponding Supabase RPCs; never copy operational data to the legacy Agent-Native database. `pmr_review_group` makes atomic, fingerprint/version-checked group decisions through existing independent photo/ETL review functions. `pmr_fsm_action` claims approved operational WOs and records actual manual stc upload references, or returns them to the RM. It does not automate stc entry. Admin-only `pmr_upsert_member` provisions existing Supabase Auth users with regions and exact team scopes. Core Approved means regional approval; `pmr_fsm_handoffs` distinguishes FSM work and actual stc upload. Test copies never enter operational handoff. Verify regional RLS, sequential reviews, pending QC rejection, FSM ownership and the work-order landing page.
