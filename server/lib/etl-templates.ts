export type SiteType = "ODU" | "SHELTER";

export interface EtlGroupDef {
  code: string;
  siteType: SiteType;
  label: string;
  suffixes: number[];
}

export const ODU_GROUPS: EtlGroupDef[] = [
  { code: "O01", siteType: "ODU", label: "Log, documents and tools", suffixes: [1, 11, 16, 49] },
  { code: "O02", siteType: "ODU", label: "External, tower, pulleys, winch, housekeeping and issues", suffixes: [22, 23, 24, 25, 26, 67] },
  { code: "O03", siteType: "ODU", label: "Battery condition, connections, cleaning, configuration, strings, labels, torque", suffixes: [2, 4, 5, 9, 10, 12, 13, 14, 15] },
  { code: "O04", siteType: "ODU", label: "Charger, specific gravity and load readings", suffixes: [3, 7, 8] },
  { code: "O05", siteType: "ODU", label: "Battery NOC alarms", suffixes: [6] },
  { code: "O06", siteType: "ODU", label: "MDB", suffixes: [17, 18, 19, 20, 21] },
  { code: "O07", siteType: "ODU", label: "Generator service, filter, pickup, oil, coolant, belts, radiator", suffixes: [27, 32, 35, 36, 38, 39, 42] },
  { code: "O08", siteType: "ODU", label: "Fuel and exhaust", suffixes: [33, 45] },
  { code: "O09", siteType: "ODU", label: "Generator controls, mode, stop, voltage, lamps, Hz, RPM, load, hours", suffixes: [28, 34, 37, 40, 41, 46, 47] },
  { code: "O10", siteType: "ODU", label: "Starter battery", suffixes: [43, 44] },
  { code: "O11", siteType: "ODU", label: "ATS, louvers and NOC", suffixes: [29, 30, 31] },
  { code: "O12", siteType: "ODU", label: "Rectifier fuses, wiring, AC and control cables", suffixes: [48, 52, 58, 61] },
  { code: "O13", siteType: "ODU", label: "Rectifier ventilation, modules, spare, installation, missing items, count", suffixes: [54, 57, 62, 63, 66] },
  { code: "O14", siteType: "ODU", label: "DC load, meters, float, limits, sharing", suffixes: [56, 59, 60, 64, 65] },
  { code: "O15", siteType: "ODU", label: "DC alarms, AC-failure test and NOC", suffixes: [50, 51, 53, 55] },
];

export const SHELTER_GROUPS: EtlGroupDef[] = [
  { code: "S01", siteType: "SHELTER", label: "AC1 mechanical, filter, insulation, condenser, bearings, fins", suffixes: [1, 2, 3, 4, 5, 10] },
  { code: "S02", siteType: "SHELTER", label: "AC1 temperature, current, voltage, wiring, breaker, refrigerant", suffixes: [6, 7, 8, 9, 11, 12] },
  { code: "S03", siteType: "SHELTER", label: "AC2 mechanical", suffixes: [13, 14, 15, 16, 17, 22] },
  { code: "S04", siteType: "SHELTER", label: "AC2 measurements, wiring, refrigerant", suffixes: [18, 19, 20, 21, 23, 24] },
  { code: "S05", siteType: "SHELTER", label: "Battery condition, connections, cleaning, configuration, strings, labels, torque", suffixes: [26, 28, 29, 33, 34, 36, 37, 38, 39] },
  { code: "S06", siteType: "SHELTER", label: "Battery documents, charger, specific gravity and load readings", suffixes: [25, 27, 31, 32] },
  { code: "S07", siteType: "SHELTER", label: "Battery NOC alarms", suffixes: [30] },
  { code: "S08", siteType: "SHELTER", label: "Tools, log, labels, logo, signboard and documents", suffixes: [35, 40, 41, 42, 43, 50, 117] },
  { code: "S09", siteType: "SHELTER", label: "MDB", suffixes: [44, 45, 46, 47, 48] },
  { code: "S10", siteType: "SHELTER", label: "External rust, guys, anchors, ladder, tower base, cables, clamps, pulleys, winch, housekeeping", suffixes: [49, 51, 52, 53, 54, 55, 56, 57, 58, 59] },
  { code: "S11", siteType: "SHELTER", label: "Fire pipework, nozzles, cylinder, gauge, tag, release, detectors, warnings", suffixes: [60, 64, 65, 66, 67, 72] },
  { code: "S12", siteType: "SHELTER", label: "Fire panel battery, lamps, trouble and auto", suffixes: [61, 62, 63, 68] },
  { code: "S13", siteType: "SHELTER", label: "Authorized fire tests, NOC and backup", suffixes: [69, 70, 71] },
  { code: "S14", siteType: "SHELTER", label: "Generator service", suffixes: [73, 78, 81, 82, 84, 85, 88] },
  { code: "S15", siteType: "SHELTER", label: "Fuel and exhaust", suffixes: [79, 91] },
  { code: "S16", siteType: "SHELTER", label: "Generator controls, mode, stop, voltage, lamps, Hz, RPM, load, hours", suffixes: [74, 80, 83, 86, 87, 92, 93] },
  { code: "S17", siteType: "SHELTER", label: "Starter battery", suffixes: [89, 90] },
  { code: "S18", siteType: "SHELTER", label: "ATS, louvers and NOC", suffixes: [75, 76, 77] },
  { code: "S19", siteType: "SHELTER", label: "HVAC panel, thermostat, setpoints, temperature and humidity", suffixes: [94, 97, 98, 100, 101] },
  { code: "S20", siteType: "SHELTER", label: "HVAC alarms, high temperature, dual operation and changeover", suffixes: [95, 96, 99, 102] },
  { code: "S21", siteType: "SHELTER", label: "Interior lights, locks, leaks, seals, racks, insulation, emergency light and housekeeping", suffixes: [103, 104, 105, 106, 107, 110, 111, 115] },
  { code: "S22", siteType: "SHELTER", label: "Door, access, tower light and alarm terminals", suffixes: [108, 109, 112] },
  { code: "S23", siteType: "SHELTER", label: "Generator room", suffixes: [113, 114] },
  { code: "S24", siteType: "SHELTER", label: "DC fuses, wiring, AC and control cables", suffixes: [116, 120, 126, 129] },
  { code: "S25", siteType: "SHELTER", label: "DC ventilation, modules, spare, installation, missing items, count", suffixes: [122, 125, 130, 131, 134] },
  { code: "S26", siteType: "SHELTER", label: "DC load, meters, float, limits, sharing", suffixes: [124, 127, 128, 132, 133] },
  { code: "S27", siteType: "SHELTER", label: "DC alarms, AC-simulation and NOC", suffixes: [118, 119, 121, 123] },
  { code: "S28", siteType: "SHELTER", label: "Truck stabilizers, tanks, brakes, registration, lights, mirrors, tyres, damage, engine, cleanliness and issues", suffixes: [135, 136, 137, 138, 139, 140, 141, 142, 143, 144] },
];

export const ETL_TEMPLATE_VERSION = "pmr-etl-mapping-v1";
export const ETL_SUFFIX_COUNT: Record<SiteType, number> = { ODU: 67, SHELTER: 144 };

export interface EtlTemplateItem {
  siteType: SiteType;
  suffix: number;
  groupCode: string;
  groupLabel: string;
  sourceWording: null;
  sourceWordingStatus: "missing_source_description";
}

export function buildEtlTemplateItems(): EtlTemplateItem[] {
  const groups = [...ODU_GROUPS, ...SHELTER_GROUPS];
  return groups.flatMap((group) =>
    group.suffixes.map((suffix) => ({
      siteType: group.siteType,
      suffix,
      groupCode: group.code,
      groupLabel: group.label,
      sourceWording: null,
      sourceWordingStatus: "missing_source_description" as const,
    })),
  );
}

export function verifyEtlMapping(): string[] {
  const problems: string[] = [];
  for (const siteType of ["ODU", "SHELTER"] as const) {
    const groups = siteType === "ODU" ? ODU_GROUPS : SHELTER_GROUPS;
    const seen = new Map<number, string>();
    for (const group of groups) {
      for (const suffix of group.suffixes) {
        if (seen.has(suffix)) {
          problems.push(`${siteType} suffix ${suffix} in ${seen.get(suffix)} and ${group.code}`);
        }
        seen.set(suffix, group.code);
      }
    }
    const expected = ETL_SUFFIX_COUNT[siteType];
    for (let n = 1; n <= expected; n++) {
      if (!seen.has(n)) problems.push(`${siteType} suffix ${n} unmapped`);
    }
    if (seen.size !== expected) {
      problems.push(`${siteType} mapped ${seen.size}, expected ${expected}`);
    }
  }
  return problems;
}
