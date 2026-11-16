// Each photo belongs to an existing evidence group on the work order.
export const photoChecklist: Record<string, readonly [string, string][]> = {
  Generator: [
    ["Oil change", "O07 S14"],
    ["Filters", "O07 S14"],
    ["Generator underside and cleaning", "O07 S23"],
    ["Generator module readings", "O09 S16"],
    ["Running hours", "O09 S16"],
    ["Generator exterior", "O07 S14"],
  ],
  "DC System": [
    ["Rectifier MCU readings", "O14 S26"],
    ["Total rectifier modules", "O13 S25"],
    ["DC breakers", "O12 S24"],
    ["Full rectifier cabinet", "O13 S25"],
    ["Busbar measurement", "O14 S26"],
  ],
  "Backup batteries": [
    ["Full battery string rack", "O03 S05"],
    ["BBU breakers", "O03 S05"],
    ["Battery measurements", "O04 S06"],
  ],
  MDB: [["MDB sub-breakers", "O06 S09"], ["MDB main breaker", "O06 S09"], ["MDB cover", "O06 S09"]],
  "Fire alarm control panel and FM200": [
    ["FACP panel", "S12"], ["FACP battery", "S12"],
    ["FM200 cylinder gauge", "S11"], ["FM200 cylinder actuator", "S11"],
  ],
  "Security System": [["SACP panel", "S22"], ["SACP battery", "S22"]],
  "Shelter Interior": [["Housekeeping — full shelter floor", "S21"], ["Full roof and lighting tubes", "S21"]],
  HVAC: [["HVAC panel inside", "S20"], ["HVAC temperature display", "S19"], ["HVAC panel exterior and buttons", "S20"]],
  ATS: [["ATS panel", "O11 S18"], ["ATS contactors", "O11 S18"], ["ATS alarms", "O11 S18"]],
  "AC Mechanical and measurement": [
    ["AC1 filter", "S01"], ["AC1 condenser cleaning", "S01"], ["AC1 package", "S02"],
    ["AC2 filter", "S03"], ["AC2 condenser cleaning", "S03"], ["AC2 package", "S04"],
  ],
  BATP: [["Alarm cabling", "S22"], ["BATP panel", "S22"]],
  "COW Exterior": [
    ["Right side from 10 m", "O02 S10"], ["Left side from 10 m", "O02 S10"],
    ["Rear from 10 m", "O02 S10"], ["Front from 10 m", "O02 S10"],
  ],
  "Site info": [["Site logo", "O01 S08"], ["Shelter lock", "S21"]],
  Fuel: [["Tank fuel level", "O08 S15"], ["Tank interior from fuel cap", "O08 S15"]],
  "Telecom racks": [["BTS door", "S21"], ["Microwave", "O02 S10"]],
  "Tower civil": [["Tower motor", "O02 S10"], ["Tower structure and guy wires", "O02 S10"], ["Tower supports and counterweights", "O02 S10"]],
  "Truck Head": [["Truck head exterior", "S28"], ["Truck head plate and front", "S28"]],
  "Visit documents and site logo": [
    ["Under generator", "O07 S23"], ["Under COW truck tank", "O02 S28"], ["Visit documentation", "O01 S08"],
  ],
};
