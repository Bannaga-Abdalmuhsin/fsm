# FSM Performance Check

A private, responsive PMR evidence application for stc COW field operations. Technicians work through 67 ODU ETLs in 15 evidence groups or 144 shelter ETLs in 28 groups. Supervisors review original photographs, link visible evidence to ETLs, record conditions, and return or approve visits.

## Implemented

- Authenticated technician/supervisor/admin access, assigned-work and region checks; no automatic first-signup administrator.
- WO, Site ID, separate TCN, schedule, PMR month and per-group equipment repetitions. Checklist and scoring snapshots are frozen on scheduling.
- Site check-in and photo capture with a 250 m boundary that accounts for GPS accuracy and freshness. Original capture time is evaluated against the TCN window; delayed uploads do not change it.
- In-app live camera, expiring admin gallery exceptions with row-locked usage limits, AES-GCM encrypted IndexedDB media/metadata drafts, retryable idempotent uploads.
- Private blob originals, authenticated binary viewing, server-side image decoding, SHA-256, 64-bit perceptual hashes, clarity checks, historical reuse findings.
- Optional actual OpenAI vision/OCR adapter: equipment matching, readable text, visible defects and daylight consistency. Missing/failed analysis stays pending. Manual review remains explicitly separate.
- Explicit ETL results, readings/units, NOC/test references and corrective TT actions; source clarification blocks passing truncated requirements.
- Mandatory submission coverage, review decisions, audit history, configurable/versioned score weights, JSON manifest, and printable visit report.

## Run

Use Node >=22.22 and the package manager in package.json.

```bash
pnpm install
mkdir -p data
pnpm db:migrate
pnpm dev --host 127.0.0.1
```

The framework uses local PGlite for development. Production requires persistent PostgreSQL `DATABASE_URL`, stable authentication secrets, HTTPS and configured private file storage. Authentication must remain enabled. Apply migrations before serving the new version.

## Provision access

An authorized deployment operator must first verify the account and organization membership, then run:

```bash
node --import tsx scripts/provision-pmr.ts email=verified-user@example.invalid role=admin regions=CR,ER org=existing-org-id
```

Use the actual verified address and existing organization ID. Provision technicians and supervisors the same way with their correct regions. Omit `org` for personal scope: managers see work they create and technicians see explicitly assigned work. Personal scopes do not create a shared regional catalogue. Sign-in alone does not grant PMR access.

## Connect storage and AI

The shared Settings interface exposes the framework connection/API-key controls. Configure a supported private blob provider or an authorized Builder file-storage connection. Never upload plaintext operational images to a public bucket. This app stores opaque handles, not image payloads in SQL.

Optional vision uses the registered **PMR_OPENAI_API_KEY** user-scoped secret. Enter it through the framework API-key settings, never source control or chat. Configuring it enables transmission of captured PMR images to OpenAI for analysis; only do so after the organization approves that processing. No key is bundled. Without it, supervisors can perform a documented manual review, and the numeric photo score stays provisional for unperformed dimensions. The model adapter is in `server/pmr/image.ts`.

## Operational limits and commissioning

This is a responsive web application, not a signed native APK. Browser camera, GPS and device-clock values are client-reported. The application cannot guarantee camera provenance, detect all edits/GPS spoofing, or independently attest offline capture time. A managed native camera/location/attestation integration is needed for stronger assurance. It never claims a photograph proves electrical or mechanical test completion. Follow authorized site procedures and do not perform disruptive tests or suppression discharge based on this app.

Gallery imports remain marked for time/location-provenance review. Daylight conflicts use confident outdoor recognition plus calculated sun position; indoor/floodlit/flash scenes are excluded. Perceptual similarity creates review, not a fraud verdict. Visible watermark time/GPS inconsistencies and suspected edits are recorded when vision can read them; this is not forensic authentication. Historical similarity scan is currently bounded to 5,000 accessible photos and flags when that limit is reached; add a dedicated similarity index before fleet-scale operation.

Shelter source wording comes from the supplied checklist. ODU descriptions are working transcriptions of the supplied ETLs. Truncated source entries remain flagged. Confirm the official complete wording and IFSM evidence/attachment rules before rollout. A group may need several angles; no photo-count cap or automatic IFSM submission is claimed. The printable report, CSV and JSON manifest contain the complete visit.

Offline drafts survive reload on the same origin/device but are not a substitute for synchronized server backups. Clearing browser storage removes unsynced drafts. Keys are non-exportable browser CryptoKeys, protected by the same origin, not by independent device hardware. Check-in currently requires connectivity. No operational photos, storage credentials, AI key, or admin account have been provisioned as part of source delivery.

## Verification

```bash
pnpm typecheck
pnpm agent-native:doctor
pnpm exec vitest run shared/pmr.spec.ts --pool=threads
node --import tsx scripts/smoke-pmr.ts
node --import tsx scripts/check-image.ts
node --import tsx scripts/smoke-upload.ts
```

Smoke scripts use clearly synthetic data and remove their fixtures. Run them against an isolated local database, never production. Field-device camera/GPS, storage-provider roundtrip, AI equipment/OCR accuracy and a full authenticated mobile walkthrough still require commissioning with approved configuration.

## GitHub Pages interactive preview

`pnpm run build:pages` builds the existing screens with a separate in-memory sample adapter into `docs/`. The public preview has a permanent demo banner, sample work orders and the full ETL catalogue. Real camera/gallery uploads, device GPS, authentication, storage and AI requests are disabled in this preview. Its illustrated evidence scores are predefined examples, not analysis results. Reloading or resetting clears demo changes.

To publish the committed preview, open repository **Settings → Pages**, select **Deploy from a branch**, then choose **main** and **/docs**, and save. GitHub Pages hosts this static demo; the authenticated operational app still needs its server deployment. Keep production photographs and credentials out of `docs/` and `preview/`.

Source entry: `preview/main.tsx`. Preview build configuration: `vite.pages.config.ts`. Production action/photo helpers are direct server-transport helpers; only the standalone preview build substitutes them. Refreshing a demo URL works through hash routing.
