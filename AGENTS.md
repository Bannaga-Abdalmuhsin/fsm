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

## PMR operations
FSM Performance Check: `/` scheduled work; `/orders/:id` field capture/results/review; `/checklists` source catalogue; `/review` active visits; `/settings` scoring/readiness. Navigation path includes the selected order ID. All times are UTC instants, displayed Asia/Riyadh. Provision roles only via the operator script after identity verification; never bootstrap the first signup as admin. Data inherits order access (assigned technician or scoped supervisor/admin). Photos require private blob storage; no public originals or SQL image bodies. Capture requires fresh accurate GPS reliably within 250 m and valid TCN; late offline upload does not change capture time. Browser GPS/camera metadata is device-reported, not attested. Functional checks need technician readings/tests. Never invent AI results: unavailable vision stays pending. Hard findings block acceptance. Existing WOs freeze checklist and scoring snapshots.

|Action|Purpose|
|---|---|
|get-pmr-dashboard|Role, authorized orders, readiness|
|create-pmr-order|Schedule visit with TCN, site and equipment|
|get-pmr-order|Read results, evidence and audit|
|check-in-pmr|Validate site location/TCN|
|save-pmr-result|Explicit ETL result/readings/TT/NOC|
|manage-pmr-approval|Admin gallery exception|
|review-pmr-evidence|Supervisor evidence decision and ETL links|
|update-pmr-order|Submit/return/approve with completion gates|
|save-pmr-policy|Publish scoring version for future WOs|
