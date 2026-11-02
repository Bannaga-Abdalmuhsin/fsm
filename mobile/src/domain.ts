import { checklists, type EvidenceGroup, type Etl } from "../../shared/checklists";

export type SiteType = "ODU" | "SHELTER";
export type { EvidenceGroup, Etl };

export function groupsFor(siteType: string): EvidenceGroup[] {
  if (siteType !== "ODU" && siteType !== "SHELTER") return [];
  return checklists[siteType];
}

export function evidenceGroupCount() {
  return checklists.ODU.length + checklists.SHELTER.length;
}

export function etlCount() {
  return [...checklists.ODU, ...checklists.SHELTER].reduce(
    (total, group) => total + group.etls.length,
    0,
  );
}

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

// Asia/Riyadh has no DST, so a fixed +03:00 offset is exact.
export function stampTime(capturedAtMs: number) {
  const shifted = new Date(capturedAtMs + RIYADH_OFFSET_MS).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 19)} GMT+03:00`;
}

export function tcnWindowMissing(order: { tcn_start: string | null; tcn_end: string | null; tcn: string | null }) {
  return !order.tcn || !order.tcn_start || !order.tcn_end;
}
