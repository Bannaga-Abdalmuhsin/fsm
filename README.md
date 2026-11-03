# BM FSM PMR

Native Expo / React Native field-maintenance app for assigned COW site PMRs. The native app is in `mobile/`; the React Router application is the separate web administration workspace. The mobile app is not a WebView wrapper.

Technicians sign in with a Supabase-provisioned account, open assigned work orders within the 250 m site boundary, capture grouped photo evidence, record ETL results/readings/TT/NOC references, and submit for independent team-leader then regional-manager review. Catalogue: 67 ODU ETLs in 15 groups; 144 Shelter ETLs in 28 groups. A group may need multiple photos to show all required details. Photos do not prove alarm tests or electrical measurements by themselves.

## Run the native app

```sh
cd mobile
npm ci
# Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npx expo start
```

Internal Android APK: `npx eas-cli@latest build --platform android --profile preview` from `mobile/`. The preview profile creates an APK. iOS internal distribution requires registered devices and Apple signing credentials; the production profile is for store distribution. Expo Go is a development client, not an APK builder.

Never put Supabase secret/service-role keys, vision API keys, Apple certificates or Expo access tokens in `EXPO_PUBLIC_*`, source control, or the phone bundle.

## Backend

Supabase Auth, Postgres RPC/RLS and private `pmr-evidence` storage enforce identity, scope, capture authorization, workflow versions, gallery exceptions and sequential review. `supabase/functions/evidence-ingest/` validates actual image bytes, derives image hashes/metrics, preserves the original, renders a server-generated Riyadh/GPS footer and registers signed results. Durable on-device uploads retry failures without replacing originals.

Deploy `evidence-ingest` with JWT verification enabled. Supabase supplies its standard server environment. Server-only vision settings are `PMR_VISION_API_KEY`, `PMR_VISION_MODEL`, and optional HTTPS `PMR_VISION_ENDPOINT` (OpenAI-compatible chat-completions endpoint). Without a configured working provider, evidence remains **Pending analysis** and cannot pass review. Model findings require field calibration; image appearance cannot conclusively prove manipulation or day/night fraud.

SQL installation order on the existing PMR reference schema: `supabase/rls.sql`, migrations `0002`, `0003`, `0004`, `supabase/checklist-catalogue.sql`, `supabase/membership-live.sql`, then the timestamped `generator_instances` migration. Do not reapply the baseline policies blindly. The deployed migration history is authoritative. `supabase/schedule-sync.sql` retains the existing separately token-authenticated Sheets ingestion contract. The public source uses `<SCHEDULE_SHEET_ID>` and `<CMDB_SHEET_ID>` setup placeholders. Resolve these only in the private deployment copy; do not commit private identifiers. Do not replace the existing configured live script with the unconfigured template. Sync secrets belong only in Apps Script properties.

## Schedule workflow

Apps Script syncs CMDB first, then schedule staging every ten minutes. CMDB is authoritative for site type, GPS and reference details. A schedule becomes a WO only when CMDB, unique WO number, TCN number/window, date and an unambiguous provisioned technician/team mapping are complete. Duplicates remain conflicts. Started WOs keep frozen snapshots; source changes do not silently rewrite active visits. Never invent missing times, WOs or emails to make rows ready.

## Verification

```sh
pnpm exec vitest run shared scripts/apps-script supabase
pnpm typecheck
pnpm agent-native:doctor
cd mobile
npm run typecheck
npm run bundle:android
```

See [release readiness](docs/RELEASE_READINESS.md) for verified deployment state and the remaining operational setup/device checks. A successful bundle export is not an installed APK or a completed field acceptance test.

## Admin remote tests

Admins can review operational WOs remotely. To test the camera workflow remotely, choose **Start admin remote test** on an operational WO. The server creates an assigned, explicitly marked test copy with a 24-hour test window. Only the admin assignee can use its distance exception; accurate, fresh real GPS remains required. Test originals and stamped derivatives retain the actual location, carry an ADMIN REMOTE TEST banner and cannot be submitted or approved as operational PMRs. Technician geofences are unchanged. This UI requires mobile version 0.2.1 or newer.

### Simple group submissions (mobile 0.3.0)

Field teams take group photos and save one PASS, FAIL, N/A or Not tested assessment per group. Remarks are optional. The only optional numeric measurements are temperature (°C), DC busbar voltage, BBU voltage and AC voltage. A group result maps to every ETL in that frozen group; it is a technician assessment, not an automated claim that all tests were verified. PASS/FAIL groups require uploaded evidence for submission. Pending analysis remains pending and cannot receive final approval.

The light native interface supports English, Hindi, Urdu and Arabic (with right-to-left layouts). Profiles support a name, mobile number and private avatar. Profile gallery access is separate from PMR evidence exceptions. Original stc ETL descriptions remain in English for reference.

Office users can export a scoped WO ZIP containing authoritative stamped photos, a printable HTML report, an Excel-compatible ETL CSV and a JSON evidence manifest. Extract the ZIP and open report.html to view or print to PDF. Exporting never changes approval status or submits to stc. Test and unapproved reports remain prominently marked. Export limits: 250 photos / 60 MB.

Deploy the simple_group_submissions_profiles_export migration and JWT-protected submission-export function before installing this version. New native modules require a new internal build.

### Capture recovery (mobile 0.3.1)

Photo groups count both local captures and uploaded evidence, without double counting. Local captures display Photo taken with Recapture and a pending/retry upload action. Completion of the persisted upload queue refreshes the visit immediately. Expo uploads pass File objects to expo/fetch; legacy URI-only multipart objects are unsupported by SDK 58. Captures are resolved from the current documents directory, so an iOS app update that changes its sandbox path does not strand saved photos. Missing originals require recapture; they are never reconstructed or silently accepted. A replacement preserves the missing capture metadata and stops its futile retries.

### Regional office portal

The web portal follows Field team → Regional team leader → Regional manager → FSM team → Uploaded to stc. Team leaders see their assigned field teams within their regions; regional managers and FSM staff see their provisioned regions. Regional approval is kept separate from the recorded stc upload. The FSM desk claims an approved operational WO, exports its report/photos, performs the real upload in stc and records the stc reference. Returns require reasons and appear at the responsible stage. All review and handoff operations use authenticated, server-scoped RPCs. The People & access page is administrator-only and grants access to existing Supabase Auth accounts; it does not offer public registration.

### National issued-WO register

Administrators and FSM users have national visibility within their organization. Team leaders and regional managers see their provisioned regions; technician assignment restrictions remain enforced. Issued WOs are imported from monthly tabs named with a month and year. Req ID and Task ID are retained separately. Exported schedule dates, ETL dates and completion dates are deliberately excluded; existing actual team schedules and TCN authorization windows are not overwritten. The issued register links to a field submission only by an exact monthly WO/task identity. Unlinked WOs remain visible as awaiting team scheduling. `Catalogue.gs` uses the existing private sync properties and a ten-minute trigger, scans monthly tabs, and preserves historical months. The Google source file is read-only. Mobile 0.3.2 colours saved group assessments by PASS/FAIL/N/A/Not tested, retaining text labels.

### Monthly operations portal

The office landing dashboard uses visible monthly WO periods and Supabase-scoped operational records. Issued WOs remain separate from actual scheduling. Region and team performance shows submitted counts and FSM-recorded stc closures; these are workflow metrics, not invented quality or SLA scores. The regional desk links sequential leader/RM reviews; FSM reports reuse the approved WO export and handover actions. The photo explorer pages private evidence with short-lived signed previews by month, region, team and ETL group. Existing assignment permissions remain authoritative; workload visibility does not grant scheduling or account-provisioning privileges.

### Native capture performance (0.3.3)

The camera preview initializes after the GPS/geofence check, independently of the parallel server-time check; capture stays disabled until both gates pass. iOS requests 1920×1080, Android chooses a supported 1–3 MP photo size, and unexpected oversized camera output is blocked locally. Camera files are stored unchanged and hashed. GPS may reuse only a native fix at most ten seconds old with accuracy within 50 m; GPS services and mock-location checks still apply. Capture time is sampled at the shutter request against the measured server clock. Upload retries run without locking the whole WO, and only the original is transmitted because Supabase creates the canonical stamped derivative. Evidence is durably stored/registered as Pending analysis before background vision review; failed analysis remains pending and can be retried. Failed oversized local captures are retained and superseded only after recapture. Device timing and OCR-provider availability still require live testing.

### Explicit photo submission (0.3.4)

New captures remain local drafts until Submit group & photos saves the group result and releases that group to the upload queue. Background retries never release unsubmitted drafts. Uploaded requires the ingest registration receipt and a matching readable Supabase evidence row; a local status alone is insufficient. Retain originals when an upload fails. The office photo explorer refreshes every 15 seconds and offers an administrator-only Admin test WOs source, clearly labelled and excluded from operational dashboards and stc workflows.

### Transparent evidence stamp (0.3.5)

New server derivatives retain the displayed photo aspect ratio and use a bottom-right white text overlay with a narrow shadow, without a solid footer. EXIF orientation is normalized once; no aspect-ratio-based rotation is applied. Native iOS capture follows device orientation even when the app UI is portrait locked. Stamps retain actual capture time, GPS with rounded accuracy, WO/site/TCN, ETLs and technician/team identity. Existing registered files remain immutable. Google reverse geocoding is not configured; phone GPS and CMDB remain authoritative, and any future address lookup must not block capture.
