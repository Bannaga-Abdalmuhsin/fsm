export const equipmentSections = [
  ["Generator", "O07 O08 O09 O10 O11 S14 S15 S16 S17 S18 S23"],
  ["ATS", "O11 S18"],
  ["Truck Civil", "S28"],
  ["Truck Head", "S28"],
  ["Shelter Interior", "S21"],
  ["COW Exterior", "O02 S10"],
  ["DC System", "O12 O13 O14 O15 S24 S25 S26 S27"],
  ["Backup batteries", "O03 O04 O05 S05 S06 S07"],
  ["MDB", "O06 S09"],
  ["Visit documents and site logo", "O01 S08"],
  ["Fire alarm control panel and FM200", "S11 S12 S13"],
  ["AC Mechanical and measurement", "S01 S02 S03 S04"],
  ["HVAC", "S19 S20"],
  ["Security System", "S22"],
  ["Tower civil", "O02 S10"],
] as const;

export function baseGroup(id: string) {
  return id.replace(/_GEN\d+$/, "");
}

export function equipmentCheckLabel(description: string) {
  return description
    .replace(/^COW_(?:ODU_)?MONTHLY_(?:ONSITE_)?\d+\s*/i, "")
    .replace(/^COW\s*-\s*/i, "")
    .replace(/^(?:BACKUP\s+BATTERY|EXTERNAL|INTERNAL|TRUCK|GENERATOR|FIRE PROTECTION|HVAC\s+PANEL|RECTIFIERS?(?:\s+and\s+DC\s+plant)?)\s*[-:]\s*/i, "")
    .replace(/\bETLs?\b/gi, "checks")
    .replace(/\s+/g, " ")
    .trim();
}

export const readingLabels = {
  strings: "Battery strings installed",
  bbu_v: "Battery voltage (V)",
  running_hours: "Generator running hours (h)",
  fuel_pct: "Fuel level (%)",
  starter_v: "Starting battery voltage (V)",
  ac_v: "Generator voltage (V)",
  frequency_hz: "Generator frequency (Hz)",
  modules_working: "Rectifier modules working",
  modules_total: "Rectifier modules installed",
  dc_busbar_v: "DC output voltage (V)",
  dc_output_a: "DC output current (A)",
  cooling_working: "Cooling units working",
  cooling_total: "Cooling units installed",
  temperature_c: "Room temperature (°C)",
} as const;

export const requiredReadings: Record<string, (keyof typeof readingLabels)[]> = {
  O03: ["strings"], S05: ["strings"],
  O04: ["bbu_v"], S06: ["bbu_v"],
  O08: ["fuel_pct"], S15: ["fuel_pct"],
  O09: ["running_hours", "ac_v", "frequency_hz"],
  S16: ["running_hours", "ac_v", "frequency_hz"],
  O10: ["starter_v"], S17: ["starter_v"],
  O13: ["modules_working", "modules_total"], S25: ["modules_working", "modules_total"],
  O14: ["dc_busbar_v", "dc_output_a"], S26: ["dc_busbar_v", "dc_output_a"],
  S19: ["cooling_working", "cooling_total", "temperature_c"],
};

export function checkInEquipmentSection(groupId: string, number: number, section: string) {
  switch (baseGroup(groupId)) {
    case "O11":
    case "S18":
      return section === ([29, 75].includes(number) ? "ATS" : "Generator");
    case "S28":
      return section === ([137, 138, 139, 140, 142].includes(number) ? "Truck Head" : "Truck Civil");
    case "O02":
      return section === ([23, 24, 25].includes(number) ? "Tower civil" : "COW Exterior");
    case "S10":
      return section === ([51, 53, 55, 56, 57, 58].includes(number) ? "Tower civil" : "COW Exterior");
    default:
      return true;
  }
}
