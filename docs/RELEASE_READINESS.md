# Native PMR setup and acceptance

The native source is in `mobile/`. The phone uses Supabase Auth, scoped RPCs and private evidence storage. The separate web workspace is not a replacement for the native application.

## Source capabilities

- Provisioned-account login with no signup screen.
- Assigned WOs with CMDB reference snapshots.
- Fresh GPS, accuracy and 250 m geofence checks; TCN-window capture authorization.
- Native camera, durable retry queue, original preservation and server-generated Riyadh/GPS photo derivatives.
- ODU: 67 ETLs in 15 base groups. Shelter: 144 ETLs in 28 base groups.
- Separate generator group instances when the technician declares more than one generator before check-in.
- ETL readings, remarks, TT/NOC references and explicit exceptions.
- Independent team-leader then regional-manager photo, ETL and order review.
- Admin-only scoped, expiring gallery exceptions and versioned quality policies.
- Configurable vision/OCR adapter, actual image decoding, hashes and image-quality metrics. Unavailable analysis stays pending.

## Deployment checklist

1. Configure the intended Supabase project and apply reviewed SQL to its matching reference schema.
2. Disable public signup in Supabase Auth. Provision users and explicit membership regions/teams through administration.
3. Configure the private bucket and deploy the authenticated evidence-ingest function.
4. Configure a server-only vision provider key/model. Run a synthetic smoke test before using operational photos.
5. Configure private schedule/CMDB identifiers and the sync token outside public source. Supply real WO numbers, technician assignments and complete TCN windows.
6. Build the native application with EAS; do not confuse a Metro export with an installable binary.
7. Verify actual devices and field acceptance before release.

## Acceptance tests

Test denied GPS/camera permissions, stale or inaccurate GPS, both sides of the site boundary, wrong TCN windows, blurred and wrong-equipment photos, gallery exceptions, network-loss/restart recovery, account-switch isolation, ETL/TT requirements, returned evidence and sequential independent approvals.

Photos do not prove functional alarm tests, electrical readings or absence of manipulation. Review ambiguous findings. Keep truncated original ETLs marked for clarification.

## Developer verification

152 relevant automated tests cover shared rules, catalogues, schedule sync, SQL workflow, image/vision adapters and durable uploads. Native/root typechecks, Deno checking, framework doctor and native bundle export are separate checks from device acceptance.
