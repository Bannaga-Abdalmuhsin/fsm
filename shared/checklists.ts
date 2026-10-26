export type Etl = {
  number: number;
  code: string;
  description: string;
  source: string;
  requiresClarification: boolean;
};
export type EvidenceGroup = { id: string; title: string; etls: Etl[] };
export const checklistVersion = 1;
export const checklists: Record<"ODU" | "SHELTER", EvidenceGroup[]> = {
  ODU: [
    {
      id: "O01",
      title: "Visit records & tools",
      etls: [
        {
          number: 1,
          code: "COW ODU_MONTHLY_ONSITE_1",
          description:
            "Power documentation, installation configuration and battery readings",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 11,
          code: "COW ODU_MONTHLY_ONSITE_11",
          description:
            "Availability of dummy load, DC clamp meter and hydrometer",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 16,
          code: "COW ODU_MONTHLY_ONSITE_16",
          description:
            "Site log, entry/exit, NOC and WO; open TTs for failed ETLs",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 49,
          code: "COW ODU_MONTHLY_ONSITE_49",
          description: "DC plant documentation and troubleshooting manuals",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O02",
      title: "External & tower",
      etls: [
        {
          number: 22,
          code: "COW ODU_MONTHLY_ONSITE_22",
          description: "Rust depth, removal, protection and paint",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 23,
          code: "COW ODU_MONTHLY_ONSITE_23",
          description: "Tower pulley function",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 24,
          code: "COW ODU_MONTHLY_ONSITE_24",
          description: "Winch motor condition",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 25,
          code: "COW ODU_MONTHLY_ONSITE_25",
          description: "Tower painting, alignment, locks and erection",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 26,
          code: "COW ODU_MONTHLY_ONSITE_26",
          description: "Outdoor oil stain and vegetation cleaning",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 67,
          code: "COW ODU_MONTHLY_67",
          description: "Any PMR visual issues",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O03",
      title: "Battery bank",
      etls: [
        {
          number: 2,
          code: "COW ODU_MONTHLY_ONSITE_2",
          description:
            "Battery availability and condition; missing or stolen asset workflow",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 4,
          code: "COW ODU_MONTHLY_ONSITE_4",
          description: "Battery cracks, corrosion, crystals and swelling",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 5,
          code: "COW ODU_MONTHLY_ONSITE_5",
          description: "Battery-to-plant connections",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 9,
          code: "COW ODU_MONTHLY_ONSITE_9",
          description: "Inter-cell connections and contact cleaning",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 10,
          code: "COW ODU_MONTHLY_ONSITE_10",
          description: "Battery connection retorque and BIS",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 12,
          code: "COW ODU_MONTHLY_ONSITE_12",
          description: "Battery cleaning and terminal care",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 13,
          code: "COW ODU_MONTHLY_ONSITE_13",
          description:
            "Battery installation date, cells, voltage and capacity configuration",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 14,
          code: "COW ODU_MONTHLY_ONSITE_14",
          description: "Number of battery strings",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 15,
          code: "COW ODU_MONTHLY_ONSITE_15",
          description: "String, stand and battery identification labels",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O04",
      title: "Battery measurements",
      etls: [
        {
          number: 3,
          code: "COW ODU_MONTHLY_ONSITE_3",
          description: "Battery charger CB, current and fluctuation",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 7,
          code: "COW ODU_MONTHLY_ONSITE_7",
          description: "Electrolyte and specific gravity where applicable",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 8,
          code: "COW ODU_MONTHLY_ONSITE_8",
          description:
            "Battery off/on-load readings and weak cells; source wording truncated, confirm complete requirement",
          source: "user-transcribed working description",
          requiresClarification: true,
        },
      ],
    },
    {
      id: "O05",
      title: "Battery alarms",
      etls: [
        {
          number: 6,
          code: "COW ODU_MONTHLY_ONSITE_6",
          description:
            "Battery discharge and external alarm test with NOC ID, date and time",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O06",
      title: "MDB & distribution",
      etls: [
        {
          number: 17,
          code: "COW ODU_MONTHLY_ONSITE_17",
          description:
            "MDB loose connections, retightening, switches, noises, fuses and tripping",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 18,
          code: "COW ODU_MONTHLY_ONSITE_18",
          description: "Cable overheating inspection",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 19,
          code: "COW ODU_MONTHLY_ONSITE_19",
          description: "Single-line diagram and circuit/switch labels",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 20,
          code: "COW ODU_MONTHLY_ONSITE_20",
          description: "Breaker contacts and power-source wiring condition",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 21,
          code: "COW ODU_MONTHLY_ONSITE_21",
          description: "MDB internal/external cleaning, cover and latch",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O07",
      title: "Generator service",
      etls: [
        {
          number: 27,
          code: "COW ODU_MONTHLY_ONSITE_27",
          description: "Generator fuel filter and glass bowl water",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 32,
          code: "COW ODU_MONTHLY_ONSITE_32",
          description: "Magnetic pickup firmness",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 35,
          code: "COW ODU_MONTHLY_ONSITE_35",
          description: "Oil level and oil/filter service by operating hours",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 36,
          code: "COW ODU_MONTHLY_ONSITE_36",
          description: "Radiator coolant level",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 38,
          code: "COW ODU_MONTHLY_ONSITE_38",
          description: "V-belts and pulley axial/radial play",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 39,
          code: "COW ODU_MONTHLY_ONSITE_39",
          description: "Air filter cleaning",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 42,
          code: "COW ODU_MONTHLY_ONSITE_42",
          description: "Radiator fins, ducting and coolant service",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O08",
      title: "Fuel & exhaust",
      etls: [
        {
          number: 33,
          code: "COW ODU_MONTHLY_ONSITE_33",
          description: "Fuel day-tank level",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 45,
          code: "COW ODU_MONTHLY_ONSITE_45",
          description: "Exhaust gas colour and leakage",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O09",
      title: "Generator controls & readings",
      etls: [
        {
          number: 28,
          code: "COW ODU_MONTHLY_ONSITE_28",
          description: "Emergency stop, gauges, meters and alarms",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 34,
          code: "COW ODU_MONTHLY_ONSITE_34",
          description: "ATS automatic and LCP remote modes",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 37,
          code: "COW ODU_MONTHLY_ONSITE_37",
          description: "Generator CB, switch and control positions",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 40,
          code: "COW ODU_MONTHLY_ONSITE_40",
          description: "Generator line-to-line voltages and fluctuation",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 41,
          code: "COW ODU_MONTHLY_ONSITE_41",
          description: "ATS/LCP pilot lamp test",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 46,
          code: "COW ODU_MONTHLY_ONSITE_46",
          description: "Frequency, RPM, fluctuation and phase load balance",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 47,
          code: "COW ODU_MONTHLY_ONSITE_47",
          description: "Operating hours",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O10",
      title: "Starting battery",
      etls: [
        {
          number: 43,
          code: "COW ODU_MONTHLY_ONSITE_43",
          description: "Starting battery SG and cell voltages",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 44,
          code: "COW ODU_MONTHLY_ONSITE_44",
          description:
            "Starting battery condition, voltage, electrolyte and terminals",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O11",
      title: "ATS & generator alarms",
      etls: [
        {
          number: 29,
          code: "COW ODU_MONTHLY_ONSITE_29",
          description:
            "ATS transfer/return and components; source wording truncated, confirm complete requirement",
          source: "user-transcribed working description",
          requiresClarification: true,
        },
        {
          number: 30,
          code: "COW ODU_MONTHLY_ONSITE_30",
          description:
            "Generator inlet/outlet louvers and damper motor operation",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 31,
          code: "COW ODU_MONTHLY_ONSITE_31",
          description:
            "Generator NOC alarm tests with IDs/date/time; repeat per generator",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O12",
      title: "DC wiring & fuses",
      etls: [
        {
          number: 48,
          code: "COW ODU_MONTHLY_ONSITE_48",
          description:
            "DC fuse types/capacities, condition, installation and spares",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 52,
          code: "COW ODU_MONTHLY_ONSITE_52",
          description: "AC/DC/module/controller connections and sensors",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 58,
          code: "COW ODU_MONTHLY_ONSITE_58",
          description:
            "AC connections, taps and phase rotation where applicable",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 61,
          code: "COW ODU_MONTHLY_ONSITE_61",
          description: "Rectifier control cable selection and routing",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O13",
      title: "Rectifier installation",
      etls: [
        {
          number: 54,
          code: "COW ODU_MONTHLY_ONSITE_54",
          description:
            "Ventilation, heat dissipation and battery heat exposure",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 57,
          code: "COW ODU_MONTHLY_ONSITE_57",
          description:
            "Rectifier individual function, displays and spare module",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 62,
          code: "COW ODU_MONTHLY_ONSITE_62",
          description: "Rectifier installation and identification",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 63,
          code: "COW ODU_MONTHLY_ONSITE_63",
          description: "Modules missing compared with design",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 66,
          code: "COW ODU_MONTHLY_ONSITE_66",
          description: "Installed module count and configuration",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O14",
      title: "DC measurements",
      etls: [
        {
          number: 56,
          code: "COW ODU_MONTHLY_ONSITE_56",
          description: "Total required site load measurement",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 59,
          code: "COW ODU_MONTHLY_ONSITE_59",
          description:
            "Meter accuracy, current limiting and partial-load features",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 60,
          code: "COW ODU_MONTHLY_ONSITE_60",
          description:
            "Stable outputs, float voltage settings and load sharing",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 64,
          code: "COW ODU_MONTHLY_ONSITE_64",
          description: "Current limit for each rectifier",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 65,
          code: "COW ODU_MONTHLY_ONSITE_65",
          description: "Rectifier/distribution readings and load sharing",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "O15",
      title: "DC alarms & tests",
      etls: [
        {
          number: 50,
          code: "COW ODU_MONTHLY_ONSITE_50",
          description: "DC controller LED/alarm indications",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 51,
          code: "COW ODU_MONTHLY_ONSITE_51",
          description: "High/low voltage alarms and high-voltage shutdown",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
        {
          number: 53,
          code: "COW ODU_MONTHLY_ONSITE_53",
          description:
            "AC-failure simulation and restoration; source wording truncated, confirm complete requirement",
          source: "user-transcribed working description",
          requiresClarification: true,
        },
        {
          number: 55,
          code: "COW ODU_MONTHLY_ONSITE_55",
          description: "DC external alarm tests with NOC IDs/date/time",
          source: "user-transcribed working description",
          requiresClarification: false,
        },
      ],
    },
  ],
  SHELTER: [
    {
      id: "S01",
      title: "AC1 mechanical",
      etls: [
        {
          number: 1,
          code: "COW_MONTHLY_ONSITE_1",
          description:
            "COW_MONTHLY_ONSITE_1 COW-AC   SPLIT UNIT No.1 - Check Abnormal Sound    , Noise or vibration from the elements    like (compressor,motor,fan,…).",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 2,
          code: "COW_MONTHLY_ONSITE_2",
          description:
            "COW_MONTHLY_ONSITE_2 COW-AC   SPLIT UNIT No.1 - Check for air filter and clean it, (replace it where   required) and straighten air outlet fins inside COW.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 3,
          code: "COW_MONTHLY_ONSITE_3",
          description:
            "COW_MONTHLY_ONSITE_3 COW-AC   SPLIT UNIT No.1 - Check Thermal Insulation And The Compressor's Rubber   Damper.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 4,
          code: "COW_MONTHLY_ONSITE_4",
          description:
            "COW_MONTHLY_ONSITE_4 COW-AC   SPLIT UNIT No.1 - Free The Condenser Screen From Any Blockages.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 5,
          code: "COW_MONTHLY_ONSITE_5",
          description:
            "COW_MONTHLY_ONSITE_5   COW-AC SPLIT UNIT No.1 - Lubricate The Bearings Of Evaporator And Condenser   Fans And Motors.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 10,
          code: "COW_MONTHLY_ONSITE_10",
          description:
            "COW_MONTHLY_ONSITE_10   COW-AC SPLIT UNIT No.1 - Straighten The Flattened Fins Of The Evaporator And   Condenser.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S02",
      title: "AC1 measurements",
      etls: [
        {
          number: 6,
          code: "COW_MONTHLY_ONSITE_6",
          description:
            "COW_MONTHLY_ONSITE_6   COW-AC SPLIT UNIT No.1 - Measure Condenser Output Air Temp.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 7,
          code: "COW_MONTHLY_ONSITE_7",
          description:
            "COW_MONTHLY_ONSITE_7   COW-AC SPLIT UNIT No.1 - Measure The Ampere Current Of Evaporator And   Condenser Fan Motors A/C Compressor As Well.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 8,
          code: "COW_MONTHLY_ONSITE_8",
          description:
            "COW_MONTHLY_ONSITE_8   COW-AC SPLIT UNIT No.1 - Observe Sound Of Condensing Unit Fan and Check its   Ampere and Voltage.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 9,
          code: "COW_MONTHLY_ONSITE_9",
          description:
            "COW_MONTHLY_ONSITE_9 COW-AC   SPLIT UNIT No.1 - Retighten All Wiring Terminals.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 11,
          code: "COW_MONTHLY_ONSITE_11",
          description:
            "COW_MONTHLY_ONSITE_11 COW-AC   SPLIT UNIT No.1- Check  Breaker   Condition of Contacts and Wiring (external and internal)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 12,
          code: "COW_MONTHLY_ONSITE_12",
          description:
            "COW_MONTHLY_ONSITE_12 COW-AC   SPLIT UNIT No.1- Check Gas (freeon) recharge and leaks if any.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S03",
      title: "AC2 mechanical",
      etls: [
        {
          number: 13,
          code: "COW_MONTHLY_ONSITE_13",
          description:
            "COW_MONTHLY_ONSITE_13   COW-AC SPLIT UNIT No.2 - Check Abnormal Sound    , Noise or vibration from the elements    like (compressor,motor,fan,…).",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 14,
          code: "COW_MONTHLY_ONSITE_14",
          description:
            "COW_MONTHLY_ONSITE_14 COW-AC   SPLIT UNIT No.2 - Check for air filter and clean it, (replace it where   required) and straighten air fins inside shelter.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 15,
          code: "COW_MONTHLY_ONSITE_15",
          description:
            "COW_MONTHLY_ONSITE_15   COW-AC SPLIT UNIT No.2 - Check Thermal Insulation And The Compressor's Rubber   Damper.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 16,
          code: "COW_MONTHLY_ONSITE_16",
          description:
            "COW_MONTHLY_ONSITE_16   COW-AC SPLIT UNIT No.2 - Free The Condenser Screen From Any Blockages.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 17,
          code: "COW_MONTHLY_ONSITE_17",
          description:
            "COW_MONTHLY_ONSITE_17   COW-AC SPLIT UNIT No.2 - Lubricate The Bearings Of Evaporator And Condenser   Fans And Motors.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 22,
          code: "COW_MONTHLY_ONSITE_22",
          description:
            "COW_MONTHLY_ONSITE_22 COW-AC   SPLIT UNIT No.2 - Straighten The Flattened Fins Of The Evaporator And   Condenser.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S04",
      title: "AC2 measurements",
      etls: [
        {
          number: 18,
          code: "COW_MONTHLY_ONSITE_18",
          description:
            "COW_MONTHLY_ONSITE_18   COW-AC SPLIT UNIT No.2 - Measure Condenser Output Air Temp.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 19,
          code: "COW_MONTHLY_ONSITE_19",
          description:
            "COW_MONTHLY_ONSITE_19   COW-AC SPLIT UNIT No.2 - Measure The Ampere Current Of Evaporator And   Condenser Fan Motors A/C Compressor As Well.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 20,
          code: "COW_MONTHLY_ONSITE_20",
          description:
            "COW_MONTHLY_ONSITE_20 COW-AC   SPLIT UNIT No.2 - Observe Sound Of Condensing Unit Fan and Check its Ampere   and Voltage.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 21,
          code: "COW_MONTHLY_ONSITE_21",
          description:
            "COW_MONTHLY_ONSITE_21 COW-AC   SPLIT UNIT No.2 - Retighten All Wiring Terminals.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 23,
          code: "COW_MONTHLY_ONSITE_23",
          description:
            "COW_MONTHLY_ONSITE_23   COW-AC SPLIT UNIT No.2- Check  Breaker   Condition of Contacts and Wiring.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 24,
          code: "COW_MONTHLY_ONSITE_24",
          description:
            "COW_MONTHLY_ONSITE_24 COW-AC   SPLIT UNIT No.2- Check Gas (freeon) recharge and leaks if any.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S05",
      title: "Battery bank",
      etls: [
        {
          number: 26,
          code: "COW_MONTHLY_ONSITE_26",
          description:
            'COW_MONTHLY_ONSITE_26 COW-BACKUP   BATTERY - Batteries available in good condition (If not - "Fail"   all relevant battery ETLs and update "Stolen" Process)',
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 28,
          code: "COW_MONTHLY_ONSITE_28",
          description:
            "COW_MONTHLY_ONSITE_28   COW-BACKUP BATTERY - Check batteries for any cracks, corrosion, any crystal   formation (eg: lead-sulphate), bulge, etc.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 29,
          code: "COW_MONTHLY_ONSITE_29",
          description:
            "COW_MONTHLY_ONSITE_29   COW-BACKUP BATTERY - Check Battery Connections to the plant.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 33,
          code: "COW_MONTHLY_ONSITE_33",
          description:
            "COW_MONTHLY_ONSITE_33   COW-BACKUP BATTERY - Check Inter Cell Connections Of The Batteries.Remove the   dirts/sand/etc. on the contacts.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 34,
          code: "COW_MONTHLY_ONSITE_34",
          description:
            "COW_MONTHLY_ONSITE_34   COW-BACKUP BATTERY - Check Retorquing Battery and connection & BIS",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 36,
          code: "COW_MONTHLY_ONSITE_36",
          description:
            "COW_MONTHLY_ONSITE_36 COW-BACKUP   BATTERY - Cleaning of Batteries : clean the batteries, contact points and use   petroleum jelly if needed.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 37,
          code: "COW_MONTHLY_ONSITE_37",
          description:
            "COW_MONTHLY_ONSITE_37   COW-BACKUP BATTERY - Mention Battery installation date/ configurations (no.   of cells and the volt and amp for each cells as well as total).",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 38,
          code: "COW_MONTHLY_ONSITE_38",
          description:
            "COW_MONTHLY_ONSITE_38   COW-BACKUP BATTERY - Mention number of strings",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 39,
          code: "COW_MONTHLY_ONSITE_39",
          description:
            "COW_MONTHLY_ONSITE_39 COW-BACKUP   BATTERY - Strings, stands and batteries are properly identified and labelled.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S06",
      title: "Battery measurements & records",
      etls: [
        {
          number: 25,
          code: "COW_MONTHLY_ONSITE_25",
          description:
            "COW_MONTHLY_ONSITE_25 COW-BACKUP   BATTERY -  Check power Documentation   availability/installation date/configuration/ volt&amp reading (attach   it) - battery readings",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 27,
          code: "COW_MONTHLY_ONSITE_27",
          description:
            "COW_MONTHLY_ONSITE_27 COW-BACKUP   BATTERY - Battery Charger Check, check if working: If CB is ON / Record   Current Meter Reading. Indicate if Current is Fluctuating.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 31,
          code: "COW_MONTHLY_ONSITE_31",
          description:
            "COW_MONTHLY_ONSITE_31   COW-BACKUP BATTERY - Check Battery Electrolyte and SG if applicable.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 32,
          code: "COW_MONTHLY_ONSITE_32",
          description:
            "COW_MONTHLY_ONSITE_32   COW-BACKUP BATTERY - Check Battery Reading readings (off load/on load)   (Mention if any batteries or cells are weak in Remarks with detailed readings   in attachment, if batteries are at risk for deep discharge, quarterly check   are enough provided monthly log is",
          source: "user-provided original checklist",
          requiresClarification: true,
        },
      ],
    },
    {
      id: "S07",
      title: "Battery alarms",
      etls: [
        {
          number: 30,
          code: "COW_MONTHLY_ONSITE_30",
          description:
            "COW_MONTHLY_ONSITE_30 COW-BACKUP   BATTERY - Check Battery Discharge Alarm Test. and External Alarm Test with   NOC (Record Alarm Id, Date and Time in Remarks)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S08",
      title: "Visit records, tools & labels",
      etls: [
        {
          number: 35,
          code: "COW_MONTHLY_ONSITE_35",
          description:
            "COW_MONTHLY_ONSITE_35 COW-BACKUP   BATTERY - Check the availability of all measuring tools (Dummy load, DC Clamp   Meter, hydrometer)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 40,
          code: "COW_MONTHLY_ONSITE_40",
          description:
            "COW_MONTHLY_ONSITE_40 COW-Check   all Tools and Test Equipments availability for all ETLs execution.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 41,
          code: "COW_MONTHLY_ONSITE_41",
          description:
            "COW_MONTHLY_ONSITE_41   COW-Check for COW site Log book and record entry and exit with relevant NOC   and in the log book with WO# for the PMR visit.-Open TTs for all failed ETLs.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 42,
          code: "COW_MONTHLY_ONSITE_42",
          description:
            "COW_MONTHLY_ONSITE_42   COW-Check labelling for each equipment in the COW.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 43,
          code: "COW_MONTHLY_ONSITE_43",
          description: "COW_MONTHLY_ONSITE_43 cow-CHECK   STC LOGO",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 50,
          code: "COW_MONTHLY_ONSITE_50",
          description:
            "COW_MONTHLY_ONSITE_50   COW-EXTERNAL - Check for STC Sign Board and and COW site label and new logo.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 117,
          code: "COW_MONTHLY_ONSITE_117",
          description:
            "COW_MONTHLY_ONSITE_117   COW-RECTIFIER and DC plant -  Check   power Documentation availability including trouble shoot manuals for the DC   plant.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S09",
      title: "MDB & distribution",
      etls: [
        {
          number: 44,
          code: "COW_MONTHLY_ONSITE_44",
          description:
            "COW_MONTHLY_ONSITE_44   COW-ELECTRICAL DISTRIBUTION PANEL / MDB - Check  cable loose connection & Re-tighten   connections, affix all switches and check for any abnormal noises and fuses   and investigate for any causes for any possible tripping and consider all   remedy measures for it.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 45,
          code: "COW_MONTHLY_ONSITE_45",
          description:
            "COW_MONTHLY_ONSITE_45   COW-ELECTRICAL DISTRIBUTION PANEL / MDB - Check Cable Overheating.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 46,
          code: "COW_MONTHLY_ONSITE_46",
          description:
            "COW_MONTHLY_ONSITE_46   COW-ELECTRICAL DISTRIBUTION PANEL / MDB - Check whether single line diagram   available and labelling of switches and circuits.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 47,
          code: "COW_MONTHLY_ONSITE_47",
          description:
            "COW_MONTHLY_ONSITE_47   COW-ELECTRICAL DISTRIBUTION PANEL / MDB- Check  Breaker Condition of Contacts, and wiring   to power sources and professional connections and safety standards observed.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 48,
          code: "COW_MONTHLY_ONSITE_48",
          description:
            "COW_MONTHLY_ONSITE_48   COW-ELECTRICAL DISTRIBUTION PANEL / MDB -Check general condition of   MCB/MDB,  clean the internal and   external parts of the panel. Switches and ensure the MDB cover is available   and securely latched.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S10",
      title: "External & tower",
      etls: [
        {
          number: 49,
          code: "COW_MONTHLY_ONSITE_49",
          description:
            "COW_MONTHLY_ONSITE_49   COW-EXTERNAL - Check for any rust and depth of the rust. Deploy any rust   removal and protection for any metal surface degradation. Perform any   required paint work.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 51,
          code: "COW_MONTHLY_ONSITE_51",
          description:
            "COW_MONTHLY_ONSITE_51   COW-EXTERNAL - Check for the presence of guy wires, in the right number and   stability and the quality of the anchoring on the ground.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 52,
          code: "COW_MONTHLY_ONSITE_52",
          description:
            "COW_MONTHLY_ONSITE_52   COW-EXTERNAL - Check for the presence of the ladder and it is in good   condition for access to doors.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 53,
          code: "COW_MONTHLY_ONSITE_53",
          description:
            "COW_MONTHLY_ONSITE_53   COW-EXTERNAL - Check for the stability and the erection base of the tower and   check for any possible damages to the mechanical base and the mechanism, and   ensure all functionality is maintained.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 54,
          code: "COW_MONTHLY_ONSITE_54",
          description:
            "COW_MONTHLY_ONSITE_54   COW-EXTERNAL - Check professional arrangement, condition and connections of   all outdoor cables (feeders, jumpers, power cables. etc…)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 55,
          code: "COW_MONTHLY_ONSITE_55",
          description:
            "COW_MONTHLY_ONSITE_55   COW-EXTERNAL - Check the clamping (D Shacles, D-Clamps, Eye Hooks and the   support for the MW infrastructure.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 56,
          code: "COW_MONTHLY_ONSITE_56",
          description:
            "COW_MONTHLY_ONSITE_56   COW-EXTERNAL - Check Tower Pulleys functional",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 57,
          code: "COW_MONTHLY_ONSITE_57",
          description:
            "COW_MONTHLY_ONSITE_57   COW-EXTERNAL - Check Winch Motor Condition",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 58,
          code: "COW_MONTHLY_ONSITE_58",
          description:
            "COW_MONTHLY_ONSITE_58   COW-EXTERNAL - Checking the towers paintings, allignment, locking system and   erection.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 59,
          code: "COW_MONTHLY_ONSITE_59",
          description:
            "COW_MONTHLY_ONSITE_59   COW-EXTERNAL - Wash outdoors any oil stains and clear grass underneath and   surroundings.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S11",
      title: "Fire suppression equipment",
      etls: [
        {
          number: 60,
          code: "COW_MONTHLY_ONSITE_60",
          description:
            "COW_MONTHLY_ONSITE_60   COW-FIRE PROTECTION - Check active connection from panel to discharge nozzle   and from the nozzle to the extinguisher cylinder",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 64,
          code: "COW_MONTHLY_ONSITE_64",
          description:
            "COW_MONTHLY_ONSITE_64   COW-FIRE PROTECTION - check pressure gauge and pressure switch of fm200/halon   cylinder. Refill and check for any overcharge. Update refill date on tag at   cylinder.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 65,
          code: "COW_MONTHLY_ONSITE_65",
          description:
            "COW_MONTHLY_ONSITE_65 COW-FIRE   PROTECTION - Check The Emergency Gas Release Station And Rectify If There Is   Problem.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 66,
          code: "COW_MONTHLY_ONSITE_66",
          description:
            "COW_MONTHLY_ONSITE_66   COW-FIRE PROTECTION - Clean And Check the operational status of Fire And   Smoke Detectors And Rectify If There is Problem. Clean with damp cloth if   sensor is dusty and check for power source or battery",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 67,
          code: "COW_MONTHLY_ONSITE_67",
          description:
            "COW_MONTHLY_ONSITE_67   COW-FIRE PROTECTION - Ensure there are no dents, leaks, rust, chemical   deposits and/or other signs of abuse/wear. Wipe off any corrosive chemicals,   oil, gunk etc. that may have deposited on the extinguisher.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 72,
          code: "COW_MONTHLY_ONSITE_72",
          description:
            "COW_MONTHLY_ONSITE_72 COW-FIRE   PROTECTION - Renew All Warning/Instruction/Damage Stickers And Warning Sign   Boards And Back Up Batteries As Well.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S12",
      title: "Fire panel",
      etls: [
        {
          number: 61,
          code: "COW_MONTHLY_ONSITE_61",
          description:
            "COW_MONTHLY_ONSITE_61 COW-FIRE   PROTECTION - Check Battery Status. Record Battery voltage must be higher than   battery nominal voltage (24v)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 62,
          code: "COW_MONTHLY_ONSITE_62",
          description:
            "COW_MONTHLY_ONSITE_62   COW-FIRE PROTECTION - Check Control Panel Indicator Bulbs- Carry out all Lamp   tests and relevant controls ( Check bulbs, LED, displays)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 63,
          code: "COW_MONTHLY_ONSITE_63",
          description:
            "COW_MONTHLY_ONSITE_63 COW-FIRE   PROTECTION - Check for  Fire Alarm   Protection System Faults ( Trouble) indications in Fire Protection Panels",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 68,
          code: "COW_MONTHLY_ONSITE_68",
          description:
            "COW_MONTHLY_ONSITE_68   COW-FIRE PROTECTION - Panel status should be always set to auto to ensure   panel serves the status and purpose. Complete Fire alarm protection quipment   should be active and should not fail in case of any  incident.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S13",
      title: "Authorized fire tests",
      etls: [
        {
          number: 69,
          code: "COW_MONTHLY_ONSITE_69",
          description:
            "COW_MONTHLY_ONSITE_69 COW-FIRE   PROTECTION - Perform all relevant (Halon discharge etc.) External alarm test   with NOC  (Record alarm id/details in   Remarks)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 70,
          code: "COW_MONTHLY_ONSITE_70",
          description:
            "COW_MONTHLY_ONSITE_70   COW-FIRE PROTECTION - Put Panel under drill or test mode and check for proper   response on compelte functioning. Verify that all indicated appliances are   operating properly as per manufacturer manual.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 71,
          code: "COW_MONTHLY_ONSITE_71",
          description:
            "COW_MONTHLY_ONSITE_71 COW-FIRE   PROTECTION - Remove prmary AC power source and check if the panel works on   the batteries . Check for any alarms.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S14",
      title: "Generator service",
      etls: [
        {
          number: 73,
          code: "COW_MONTHLY_ONSITE_73",
          description:
            "COW_MONTHLY_ONSITE_73   COW-GENERATOR  - Check Fuel Filter   & Glass Bowl for Water.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 78,
          code: "COW_MONTHLY_ONSITE_78",
          description:
            "COW_MONTHLY_ONSITE_78   COW-GENERATOR - Check Firmness of Magnetic Pick Up",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 81,
          code: "COW_MONTHLY_ONSITE_81",
          description:
            "COW_MONTHLY_ONSITE_81   COW-GENERATOR - Check oil level, change oil and filter based on relevant   operational hours",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 82,
          code: "COW_MONTHLY_ONSITE_82",
          description:
            "COW_MONTHLY_ONSITE_82   COW-GENERATOR - Check Radiator coolant level. Top Up coolant if level is at   the bottom of the Filter neck.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 84,
          code: "COW_MONTHLY_ONSITE_84",
          description:
            "COW_MONTHLY_ONSITE_84   COW-GENERATOR - Check V-Belts condition . Replace, if necessary. Check if   belt pulleys have no excessive axial and radial plays.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 85,
          code: "COW_MONTHLY_ONSITE_85",
          description:
            "COW_MONTHLY_ONSITE_85   COW-GENERATOR - Clean Air filters",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 88,
          code: "COW_MONTHLY_ONSITE_88",
          description:
            "COW_MONTHLY_ONSITE_88   COW-GENERATOR - Radiator Air Flow Check: Clear Radiators fins from   accumulated dirt / check for Torn Radiator Canvass Ducting / change coolant.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S15",
      title: "Fuel & exhaust",
      etls: [
        {
          number: 79,
          code: "COW_MONTHLY_ONSITE_79",
          description:
            "COW_MONTHLY_ONSITE_79   COW-GENERATOR - Check Fuel Level: Fuel Day Tank -",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 91,
          code: "COW_MONTHLY_ONSITE_91",
          description:
            "COW_MONTHLY_ONSITE_91   COW-GENERATOR- Check and Identify the color of Exhaust Gas Emission&   Check Exhaust Gas Leakage.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S16",
      title: "Generator controls & readings",
      etls: [
        {
          number: 74,
          code: "COW_MONTHLY_ONSITE_74",
          description:
            "COW_MONTHLY_ONSITE_74   COW-GENERATOR -  Ensure remote   emergency stop button/switch functions. Also check for proper functioning of   all required guages, meters, alarms etc.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 80,
          code: "COW_MONTHLY_ONSITE_80",
          description:
            "COW_MONTHLY_ONSITE_80   COW-GENERATOR - Check if System is in Automatic Mode (ATS). Local Control   Panel (LCP) to REMOTE.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 83,
          code: "COW_MONTHLY_ONSITE_83",
          description:
            "COW_MONTHLY_ONSITE_83   COW-GENERATOR - Check Relevant CB's, Switches and Controls for the Right   Position.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 86,
          code: "COW_MONTHLY_ONSITE_86",
          description:
            "COW_MONTHLY_ONSITE_86   COW-GENERATOR - GS Line-to-Line Voltages. Indicate if Fluctuating.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 87,
          code: "COW_MONTHLY_ONSITE_87",
          description:
            "COW_MONTHLY_ONSITE_87   COW-GENERATOR - Press Pilot Lamp Test Button and Check if All Bulbs Glow (ATS   & LCP).",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 92,
          code: "COW_MONTHLY_ONSITE_92",
          description:
            "COW_MONTHLY_ONSITE_92   COW-GENERATOR -GS Frequency (Hz) and RPM, . Indicate if Fluctuating. Check if   current load is reasonably balanced between phases.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 93,
          code: "COW_MONTHLY_ONSITE_93",
          description:
            "COW_MONTHLY_ONSITE_93   COW-GENERATOR -Record Operating Hour Readings.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S17",
      title: "Starting battery",
      etls: [
        {
          number: 89,
          code: "COW_MONTHLY_ONSITE_89",
          description:
            "COW_MONTHLY_ONSITE_89   COW-GENERATOR - Record SG ( Specific Gravity ) and Cell Voltages of Starting   Battery.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 90,
          code: "COW_MONTHLY_ONSITE_90",
          description:
            "COW_MONTHLY_ONSITE_90   COW-GENERATOR - Starter Battery Check: (Confirm Availability) and in good   condition Check & Record Battery Voltage / Top up Distilled Water if   Electrolyte Level is below or at Minimum / Check & Clear Corroded   Terminals and retight, if required.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S18",
      title: "ATS & generator alarms",
      etls: [
        {
          number: 75,
          code: "COW_MONTHLY_ONSITE_75",
          description:
            "COW_MONTHLY_ONSITE_75   COW-GENERATOR - ATS (if exists) - Test the ATS by operating the transfer   switch from the standard position to the alternate position and then return   to the standard position. Check complete functioning of all   components(switchboard, By-Pass power cable & term",
          source: "user-provided original checklist",
          requiresClarification: true,
        },
        {
          number: 76,
          code: "COW_MONTHLY_ONSITE_76",
          description:
            "COW_MONTHLY_ONSITE_76   COW-GENERATOR - Check Air Louvers: Inlet and Outlet Damper Motors for   Operation by switching on & off GS.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 77,
          code: "COW_MONTHLY_ONSITE_77",
          description:
            "COW_MONTHLY_ONSITE_77   COW-GENERATOR - Check and test all alarms (Low fuel, Gen fail, etc) with the   NOC (record alarm ids, date and time in remarks). Repeat all ETLs for   Generator  if there are more   generators.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S19",
      title: "HVAC settings & readings",
      etls: [
        {
          number: 94,
          code: "COW_MONTHLY_ONSITE_94",
          description:
            "COW_MONTHLY_ONSITE_94 COW-HVAC   PANEL  - Check Manual Alarms  And The Corresponding Indicator Lights.   Check General condition of HVAC panel and if all is working. Repair any faults   and perform any required re-Programming or resets etc.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 97,
          code: "COW_MONTHLY_ONSITE_97",
          description:
            "COW_MONTHLY_ONSITE_97 COW-HVAC   PANEL - Check overall condition of default thermostat and humidistat (if not   integrated) and connections to HVAC Panel and control and ensure accurate   functioning and data. Replace/repair default thermostat if not working.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 98,
          code: "COW_MONTHLY_ONSITE_98",
          description:
            "COW_MONTHLY_ONSITE_98   COW-HVAC PANEL - Check The Cut-in And Cut-out Required Temp.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 100,
          code: "COW_MONTHLY_ONSITE_100",
          description:
            "COW_MONTHLY_ONSITE_100 COW-HVAC   PANEL - Measure Ambient Temp. Near A/C Compressor And Shelter Room Temp.   Temperature to be maintained and not exceed 25 C (Temperature set point-20,   max 30 (alarm set point))",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 101,
          code: "COW_MONTHLY_ONSITE_101",
          description:
            "COW_MONTHLY_ONSITE_101   COW-HVAC PANEL - Measure Shelter Room Humidity. Check Humidity set point.   Humidity to not exceed 60%rh (High humidity alarm > 60%rh) - Readjust A/Cs   in case of signs of high humidity within the COW.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S20",
      title: "HVAC functional tests",
      etls: [
        {
          number: 95,
          code: "COW_MONTHLY_ONSITE_95",
          description:
            "COW_MONTHLY_ONSITE_95   COW-HVAC PANEL - Also check AC1 fail, AC2 fail, High humidity alarms relay to   NOC (Record Alarm ID, Date and Time in Remarks)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 96,
          code: "COW_MONTHLY_ONSITE_96",
          description:
            "COW_MONTHLY_ONSITE_96 COW-HVAC   PANEL - Check for the necessity and possibility of running both A/C units in   case of overheating or extreme climatic conditions.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 99,
          code: "COW_MONTHLY_ONSITE_99",
          description:
            "COW_MONTHLY_ONSITE_99   COW-HVAC PANEL - Conduct Hi Temp. Signal Test From Controller To BTS and Test   External alarm with NOC (Record Alarm ID, Date and Time in Remarks)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 102,
          code: "COW_MONTHLY_ONSITE_102",
          description:
            "COW_MONTHLY_ONSITE_102 COW-HVAC   PANEL - Perform th operation of the auto A/C Changeover system and ensure   that both the active and the standby A/Cs are always ready in service and   fully functional.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S21",
      title: "Interior & housekeeping",
      etls: [
        {
          number: 103,
          code: "COW_MONTHLY_ONSITE_103",
          description:
            "COW_MONTHLY_ONSITE_103   COW-INTERNAL - Check All Lighting (Tubes/Bulbs), Switches and Connections and   ensure the lighting is adequate.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 104,
          code: "COW_MONTHLY_ONSITE_104",
          description:
            "COW_MONTHLY_ONSITE_104   COW-INTERNAL - check all locks, padlock and hinge condition and complete   latch for both main door and GS room door.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 105,
          code: "COW_MONTHLY_ONSITE_105",
          description:
            "COW_MONTHLY_ONSITE_105   COW-INTERNAL - Check for any cracks or water leaks or damages inside the COW   and ensure all corrective measures are to be taken.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 106,
          code: "COW_MONTHLY_ONSITE_106",
          description:
            "COW_MONTHLY_ONSITE_106   COW-INTERNAL - Check for cable entries into COW to be properly sealed using   fire and weather proof sealant.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 107,
          code: "COW_MONTHLY_ONSITE_107",
          description:
            "COW_MONTHLY_ONSITE_107   COW-INTERNAL - Check for proper civil stability of cable racks and other iron   works. All types of cables in the COW must be professionally and legibly   arranged, mounted and connected.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 110,
          code: "COW_MONTHLY_ONSITE_110",
          description:
            "COW_MONTHLY_ONSITE_110   COW-INTERNAL - Check the interior insulations all around.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 111,
          code: "COW_MONTHLY_ONSITE_111",
          description:
            "COW_MONTHLY_ONSITE_111   COW-INTERNAL - EMERGENCY LIGHT - Ensure Emergency light is working and are   fully recharge in case of Emergency use.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 115,
          code: "COW_MONTHLY_ONSITE_115",
          description:
            "COW_MONTHLY_ONSITE_115   COW-INTERNAL - Housekeeping: Clean Interior and exterior of the COW. Clean   all dust, stains on walls and floors with appropriate solutions.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S22",
      title: "Access & passive alarms",
      etls: [
        {
          number: 108,
          code: "COW_MONTHLY_ONSITE_108",
          description:
            "COW_MONTHLY_ONSITE_108   COW-INTERNAL - Check for the complete functioning of the door alarm and   record the alarm id and test it with the NOC. Ensure the door access panels   is functional and in service.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 109,
          code: "COW_MONTHLY_ONSITE_109",
          description:
            "COW_MONTHLY_ONSITE_109   COW-INTERNAL - Check for Tower light and sensor - Make sure it is   working/Check Panel condition",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 112,
          code: "COW_MONTHLY_ONSITE_112",
          description:
            "COW_MONTHLY_ONSITE_112   COW-INTERNAL - Ensure all sensors for all passive support equipment are   rightly terminated towards BATB and continuity of alarms from all sensors   (ensure all functional) exists.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S23",
      title: "Generator room",
      etls: [
        {
          number: 113,
          code: "COW_MONTHLY_ONSITE_113",
          description:
            "COW_MONTHLY_ONSITE_113   COW-INTERNAL - GS - Room  - Wash &   Clean Generator Room Fresh Air Intake Filter Mats (GS Cooling not upgraded) -   clean all diesel stains and grease- Ensure cable outlets are properly organized   and that the generator is professionally deployed inside the Gen r",
          source: "user-provided original checklist",
          requiresClarification: true,
        },
        {
          number: 114,
          code: "COW_MONTHLY_ONSITE_114",
          description:
            "COW_MONTHLY_ONSITE_114   COW-INTERNAL - GS Room - Ensure all surfaces and equipment is cleaned inside   the Generator room.Clean all exhaust or air outlet systems louvers etc and   ensure proper functioning of lighting and any fire protection deployed inside   the room.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S24",
      title: "DC wiring & fuses",
      etls: [
        {
          number: 116,
          code: "COW_MONTHLY_ONSITE_116",
          description:
            "COW_MONTHLY_ONSITE_116   COW-RECTIFIER and DC plant -  Check   correct type & capacity fuses are provided and all fuses are clean and   properly installed. Provide spare fuses.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 120,
          code: "COW_MONTHLY_ONSITE_120",
          description:
            "COW_MONTHLY_ONSITE_120   COW-RECTIFIER and DC plant - Check Loose Connections and all proper   connections in AC, DC and rectifier modules (including DC output cables), DC   controller and  plant control panel.   Also check all sensors in the plant.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 126,
          code: "COW_MONTHLY_ONSITE_126",
          description:
            "COW_MONTHLY_ONSITE_126   COW-RECTIFIERS and DC plant - Check that AC power connections are properly   maded. Ensure proper taps and phase rotation if applicable.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 129,
          code: "COW_MONTHLY_ONSITE_129",
          description:
            "COW_MONTHLY_ONSITE_129   COW-RECTIFIERS and DC plant - Ensure proper selection and routing of   rectifier control cables to plant controller.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S25",
      title: "Rectifier installation",
      etls: [
        {
          number: 122,
          code: "COW_MONTHLY_ONSITE_122",
          description:
            "COW_MONTHLY_ONSITE_122   COW-RECTIFIER and DC plant - Ensure that there is adequate ventilation &   heat dissipation so rectifier will not overheat and also ensure batteries are   not affected by heat.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 125,
          code: "COW_MONTHLY_ONSITE_125",
          description:
            "COW_MONTHLY_ONSITE_125   COW-RECTIFIERS and DC plant - Check for proper functioning including display   and control modules through individual tests for all rectifiers. Ensure a   spare rectifier exists",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 130,
          code: "COW_MONTHLY_ONSITE_130",
          description:
            "COW_MONTHLY_ONSITE_130   COW-RECTIFIERS and DC plant - Ensure rectifiers are properly installed and   identified.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 131,
          code: "COW_MONTHLY_ONSITE_131",
          description:
            "COW_MONTHLY_ONSITE_131   COW-RECTIFIERS and DC plant - Mention number of Rectifiers units missing (if   any) from equipment design.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 134,
          code: "COW_MONTHLY_ONSITE_134",
          description:
            "COW_MONTHLY_ONSITE_134   COW-RECTIFIERS and DC plant: Count number of rectifiers available (value) and   mention the configuration in remarks (eg: 4 x 50A =200 A)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S26",
      title: "DC measurements",
      etls: [
        {
          number: 124,
          code: "COW_MONTHLY_ONSITE_124",
          description:
            "COW_MONTHLY_ONSITE_124   COW-RECTIFIERS and DC plant  - Check   through DC plant and tools the total load required. Provide the required load   value for the site.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 127,
          code: "COW_MONTHLY_ONSITE_127",
          description:
            "COW_MONTHLY_ONSITE_127   COW-RECTIFIERS and DC plant - Ensure all DC plant meters are accurate and   properly adjusted. Ensure any current limiting and partial load features are   running and properly adjusted.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 128,
          code: "COW_MONTHLY_ONSITE_128",
          description:
            "COW_MONTHLY_ONSITE_128   COW-RECTIFIERS and DC plant - Ensure outputs of all units are stable and   rectifier float voltages are properly set for the battery type and load   sharing.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 132,
          code: "COW_MONTHLY_ONSITE_132",
          description:
            "COW_MONTHLY_ONSITE_132   COW-RECTIFIERS and DC plant - Provide Rectifier Current Limit (A) for each.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 133,
          code: "COW_MONTHLY_ONSITE_133",
          description:
            "COW_MONTHLY_ONSITE_133   COW-RECTIFIERS and DC plant- Check Rectifier Load Sharing. Read and record   rectifiers and distribution reading from display screens.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S27",
      title: "DC alarms & tests",
      etls: [
        {
          number: 118,
          code: "COW_MONTHLY_ONSITE_118",
          description:
            "COW_MONTHLY_ONSITE_118   COW-RECTIFIER and DC plant - Check alarm controller unit led check of the dc   components.(Rect. Fail alarm, over voltage, BD, Batt. Fuse alarm, Maj. Fuse   alarm, Min. fuse alarm, AC fail alarm)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 119,
          code: "COW_MONTHLY_ONSITE_119",
          description:
            "COW_MONTHLY_ONSITE_119   COW-RECTIFIER and DC plant - Check High/Low Voltage Alarm and the relevant   features such as High-voltage shut down works properly.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 121,
          code: "COW_MONTHLY_ONSITE_121",
          description:
            "COW_MONTHLY_ONSITE_121   COW-RECTIFIER and DC plant - Commercial Power Fail Simulation - Simulate an   AC power failure to verify units ability and ensure that the alarms clear and   that the units return to float voltage when AC power is restored. - Ensure DC   Controller is working and e",
          source: "user-provided original checklist",
          requiresClarification: true,
        },
        {
          number: 123,
          code: "COW_MONTHLY_ONSITE_123",
          description:
            "COW_MONTHLY_ONSITE_123   COW-RECTIFIER and DC plant-  Perform   all related External alarm tests    (appearance and continuity) of DC plant with NOC (including power   fail, battery charge, rectifier minor/major issues etc) (Record Alarm Ids,   Date and Time in Remarks)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
    {
      id: "S28",
      title: "Truck & visual issues",
      etls: [
        {
          number: 135,
          code: "COW_MONTHLY_ONSITE_135",
          description:
            "COW_MONTHLY_ONSITE_135   COW-TRUCK - Check condition of truck stabilizers and ensure they are   maintained well and balanced when in use and painted.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 136,
          code: "COW_MONTHLY_ONSITE_136",
          description:
            "COW_MONTHLY_ONSITE_136   COW-TRUCK - Check the condition of all fuel tanks, stop any leakeages and   check the fuel level.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 137,
          code: "COW_MONTHLY_ONSITE_137",
          description:
            "COW_MONTHLY_ONSITE_137 COW-TRUCK   - Check the condition of all parking and service brakes, brake oil.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 138,
          code: "COW_MONTHLY_ONSITE_138",
          description:
            "COW_MONTHLY_ONSITE_138   COW-TRUCK- Check complete vehicle maintenance, registration validity etc.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 139,
          code: "COW_MONTHLY_ONSITE_139",
          description:
            "COW_MONTHLY_ONSITE_139   COW-TRUCK- Check COW headlights and tail lights and windshield conditions,   mirrors. Restore any deficiencies.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 140,
          code: "COW_MONTHLY_ONSITE_140",
          description:
            "COW_MONTHLY_ONSITE_140   COW-TRUCK- Check COW tyres condition and pressure, replace damaged tyres and   ensure presence of spare tyre.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 141,
          code: "COW_MONTHLY_ONSITE_141",
          description:
            "COW_MONTHLY_ONSITE_141   COW-TRUCK- Check for any damages, theft, vandalism, accidents and take it up   with the relevant authourities.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 142,
          code: "COW_MONTHLY_ONSITE_142",
          description:
            "COW_MONTHLY_ONSITE_142   COW-TRUCK- Check proper functioning of the truck engine, check engine oil,   engine belts, etc.",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 143,
          code: "COW_MONTHLY_ONSITE_143",
          description:
            "COW_MONTHLY_ONSITE_143   COW-TRUCK- Clean / Wash COW (Shelter, Truck, trailer, flatbed,  etc…)",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
        {
          number: 144,
          code: "COW_MONTHLY_144",
          description: "COW_MONTHLY_144 Any PMR visual   issues",
          source: "user-provided original checklist",
          requiresClarification: false,
        },
      ],
    },
  ],
};
