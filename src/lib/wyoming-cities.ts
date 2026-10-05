export interface WyomingForecastZone {
  /** National Weather Service public forecast or fire-weather zone identifier. */
  id: string;
  name: string;
}

export interface WyomingScannerTalkgroup {
  /** WyoLink decimal talkgroup ID or VHF frequency label. */
  id: string;
  alphaTag: string;
  description: string;
  service: "Law Dispatch" | "Law Tac" | "Fire Dispatch" | "Fire-Tac" | "EMS Dispatch" | "Hospital" | "Interop" | "Public Works" | "Emergency Ops" | "Weather";
  frequency?: string;
}

export interface WyomingScannerFeed {
  /** Broadcastify feed ID or WyoLink node identifier. */
  id: string;
  name: string;
  county: string;
  city: string;
  agencies: readonly string[];
  system: string;
  primaryFrequency: string;
  /** Direct Broadcastify web listen page. */
  listenUrl: string;
  /** Embedded pop-out player URL. */
  popoutUrl: string;
  /** Direct MP3 CDN audio stream URL (public Broadcastify relay). */
  streamUrl?: string;
  /** Broadcastify feed archive URL. */
  archiveUrl?: string;
  /** Broadcastify Calls SDRTrunk P25 node URL where available. */
  callsNodeUrl?: string;
  /** RadioReference frequency & talkgroup database page. */
  radioReferenceUrl: string;
  featured?: boolean;
}

export interface WyomingDispatchCenter {
  name: string;
  address?: string;
  nonEmergencyPhone: string;
  url: string;
  cadName?: string;
  cadUrl?: string;
  inmateRosterUrl?: string;
}

export interface WyomingCity {
  id: string;
  name: string;
  county: string;
  /** 6-digit SAME / FIPS county code used in NWS alert geocodes (e.g. 056021 for Laramie County). */
  sameCode: string;
  /** ICAO surface observation station ID for live airport METAR readings. */
  observationStation: string;
  /** NOAA Weather Radio station & frequency. */
  noaaRadio?: string;
  /** Approximate city-center coordinates used for the NWS point forecast. */
  latitude: number;
  longitude: number;
  highways: readonly string[];
  /** Forecast and fire-weather zones that cover the city and its surrounding response area. */
  nwsZones: readonly WyomingForecastZone[];
  /** Primary 911 PSAP / dispatch center and public CAD mapping links. */
  dispatch: WyomingDispatchCenter;
  /** Live Broadcastify / WyoLink scanner feeds covering this city and county. */
  scanners: readonly WyomingScannerFeed[];
}

/**
 * Verified WyoLink P25 Phase I (System 3939, Archer 800 MHz Node 6571) and VHF
 * talkgroups/frequencies for Cheyenne and Laramie County public safety.
 */
export const CHEYENNE_WYOLINK_TALKGROUPS: readonly WyomingScannerTalkgroup[] = [
  {
    id: "02-LE 1",
    alphaTag: "02-LE 1 DSP",
    description: "Laramie County Law Enforcement 1 Dispatch (Cheyenne PD 'Paul', Sheriff 'Charlie', Pine Bluffs 'PB')",
    service: "Law Dispatch",
    frequency: "154.800 MHz / WyoLink",
  },
  {
    id: "260",
    alphaTag: "02-CPD",
    description: "Cheyenne Police Department Car-to-Car Tactical (CPD 2/3: 154.755 / 155.610 MHz)",
    service: "Law Tac",
    frequency: "154.755 MHz / TG 260",
  },
  {
    id: "WHP-AXO",
    alphaTag: "WHP AXO 1/2",
    description: "Wyoming Highway Patrol Troop A (Cheyenne / I-25 & I-80 Corridor) Dispatch 1 & 2",
    service: "Law Dispatch",
    frequency: "WyoLink 800 / VHF",
  },
  {
    id: "203",
    alphaTag: "02-CFR 1",
    description: "Cheyenne Fire Rescue Primary Dispatch (Stations 1–6)",
    service: "Fire Dispatch",
    frequency: "154.400 MHz / TG 203",
  },
  {
    id: "204",
    alphaTag: "02-CTAC 2–4",
    description: "Cheyenne Fire Rescue Tactical Operations (TG 204 CTAC 2, TG 205 CTAC 3, TG 206 CTAC 4)",
    service: "Fire-Tac",
    frequency: "WyoLink TG 204–206",
  },
  {
    id: "207",
    alphaTag: "02-MED 5",
    description: "Cheyenne Fire Rescue EMS & Medical Operations (TG 207 MED 5, TG 210 SOPS 8)",
    service: "EMS Dispatch",
    frequency: "WyoLink TG 207",
  },
  {
    id: "02-FDSP",
    alphaTag: "02-FDSP A/B",
    description: "Laramie County Fire Districts #1–#10 Dispatch A/B & VHF Paging (Cheyenne, Burns, Carpenter, Pine Bluffs)",
    service: "Fire Dispatch",
    frequency: "155.715 MHz / WyoLink",
  },
  {
    id: "02-CAT",
    alphaTag: "02-CAT 1–4",
    description: "Laramie County Fire Tactical & Multi-Agency Coordination (153.9275 / 154.160 MHz)",
    service: "Fire-Tac",
    frequency: "153.9275 MHz / WyoLink",
  },
  {
    id: "02-AMR",
    alphaTag: "02-FD/MED AMR",
    description: "American Medical Response (AMR) & Laramie County EMS Dispatch",
    service: "EMS Dispatch",
    frequency: "158.805 MHz / WyoLink",
  },
  {
    id: "213",
    alphaTag: "02-CRMC",
    description: "Cheyenne Regional Medical Center Emergency Department Med-Com",
    service: "Hospital",
    frequency: "155.355 MHz / TG 213",
  },
  {
    id: "266",
    alphaTag: "02-BOPU 1–3",
    description: "Cheyenne Board of Public Utilities Operations & Water/Sewer Dispatch",
    service: "Public Works",
    frequency: "WyoLink TG 266–270",
  },
  {
    id: "6202",
    alphaTag: "WYOHS-02 / MAT 7",
    description: "Laramie County Emergency Management & Region 7 Multi-Agency Interop",
    service: "Emergency Ops",
    frequency: "WyoLink TG 6202",
  },
];

/**
 * Primary Cheyenne & Laramie County live scanner feeds on Broadcastify / WyoLink.
 */
export const CHEYENNE_SCANNER_FEEDS: readonly WyomingScannerFeed[] = [
  {
    id: "47003",
    name: "Laramie County Law Enforcement",
    county: "Laramie County",
    city: "Cheyenne",
    agencies: [
      "Cheyenne Police Dept (CPD)",
      "Laramie County Sheriff (LCSO)",
      "Wyoming Highway Patrol (WHP AXO)",
      "Pine Bluffs Police Dept",
    ],
    system: "WyoLink P25 (Archer 800 MHz Node 6571) · 02-LE 1 Dispatch",
    primaryFrequency: "154.800 MHz / WyoLink 800",
    listenUrl: "https://www.broadcastify.com/listen/feed/47003",
    popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=47003",
    streamUrl: "https://broadcastify.cdnstream1.com/47003",
    archiveUrl: "https://www.broadcastify.com/archives/feed/?feedId=47003",
    callsNodeUrl: "https://www.broadcastify.com/calls/node/6571",
    radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3134",
    featured: true,
  },
  {
    id: "47019",
    name: "Laramie County Public Safety (All-Hazards)",
    county: "Laramie County",
    city: "Cheyenne",
    agencies: [
      "Cheyenne PD",
      "Laramie County SO",
      "Wyoming Highway Patrol",
      "Cheyenne Fire Rescue (CFR)",
      "Laramie County Fire Districts #1–#10",
      "AMR EMS",
    ],
    system: "WyoLink P25 (02-LE 1, WHP AXO 1/2, 02-CFR 1, 02-FDSP A/B, 02-CAT 1–4, 02-FD/MED)",
    primaryFrequency: "154.400 / 154.800 / 155.715 MHz",
    listenUrl: "https://www.broadcastify.com/listen/feed/47019",
    popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=47019",
    streamUrl: "https://broadcastify.cdnstream1.com/47019",
    archiveUrl: "https://www.broadcastify.com/archives/feed/?feedId=47019",
    callsNodeUrl: "https://www.broadcastify.com/calls/node/6571",
    radioReferenceUrl: "https://www.radioreference.com/db/sid/3939",
    featured: true,
  },
  {
    id: "46189",
    name: "Laramie County Fire and EMS",
    county: "Laramie County",
    city: "Cheyenne",
    agencies: [
      "Cheyenne Fire Rescue (CFR)",
      "Laramie County Fire Districts",
      "AMR Ambulance",
      "CRMC Med-Com",
    ],
    system: "WyoLink P25 & VHF Fire/EMS Dispatch",
    primaryFrequency: "154.400 / 155.715 / 158.805 MHz",
    listenUrl: "https://www.broadcastify.com/listen/feed/46189",
    popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=46189",
    streamUrl: "https://broadcastify.cdnstream1.com/46189",
    archiveUrl: "https://www.broadcastify.com/archives/feed/?feedId=46189",
    callsNodeUrl: "https://www.broadcastify.com/calls/node/6571",
    radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3134",
    featured: true,
  },
  {
    id: "46359",
    name: "Laramie County Fire District 3 & East County",
    county: "Laramie County",
    city: "Cheyenne / Albin / Pine Bluffs",
    agencies: [
      "Laramie County Fire District 3",
      "Pine Bluffs Fire/EMS",
      "East Laramie County Mutual Aid",
    ],
    system: "VHF & WyoLink Rural Fire Dispatch",
    primaryFrequency: "155.715 / 155.250 MHz",
    listenUrl: "https://www.broadcastify.com/listen/feed/46359",
    popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=46359",
    streamUrl: "https://broadcastify.cdnstream1.com/46359",
    archiveUrl: "https://www.broadcastify.com/archives/feed/?feedId=46359",
    callsNodeUrl: "https://www.broadcastify.com/calls/node/6571",
    radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3134",
  },
];

/**
 * City-center reference points, NWS forecast/fire zones, airport METAR stations,
 * 911 dispatch centers, and live Broadcastify/WyoLink scanner feeds across Wyoming.
 */
export const WYOMING_CITIES: readonly WyomingCity[] = [
  {
    id: "cheyenne",
    name: "Cheyenne",
    county: "Laramie County",
    sameCode: "056021",
    observationStation: "KCYS",
    noaaRadio: "WXM37 · 162.475 MHz (NWS Cheyenne)",
    latitude: 41.14,
    longitude: -104.82,
    highways: ["I-25", "I-80", "US-85", "US-30", "WY-210", "WY-212"],
    nwsZones: [
      { id: "WYZ118", name: "Central Laramie County" },
      { id: "WYZ119", name: "East Laramie County" },
      { id: "WYZ430", name: "Laramie Foothills and High Plains" },
      { id: "WYZ431", name: "Southern Laramie County" },
      { id: "WYZ432", name: "Bordeaux/Chugwater/Wheatland" },
    ],
    dispatch: {
      name: "Laramie County Combined Communications Center (911 PSAP)",
      address: "415 W. 18th St., Cheyenne, WY 82001",
      nonEmergencyPhone: "(307) 637-6525",
      url: "https://www.laramiecountywy.gov/County-Government/County-Departments/Combined-Communications",
      cadName: "CPD / LCSO Citizen Connect CAD Map",
      cadUrl: "https://www.cheyennepd.org/citizenconnect",
      inmateRosterUrl: "https://www.laramiecountywy.gov/County-Government/Elected-Officials/Laramie-County-Sheriffs-Office",
    },
    scanners: CHEYENNE_SCANNER_FEEDS,
  },
  {
    id: "casper",
    name: "Casper",
    county: "Natrona County",
    sameCode: "056025",
    observationStation: "KCPR",
    noaaRadio: "WXM47 · 162.550 MHz",
    latitude: 42.85,
    longitude: -106.32,
    highways: ["I-25", "US-20", "US-26", "US-87", "WY-220", "WY-259"],
    nwsZones: [
      { id: "WYZ020", name: "Natrona County Lower Elevations" },
      { id: "WYZ022", name: "Casper Mountain" },
      { id: "WYZ280", name: "Natrona County Fire Zone" },
    ],
    dispatch: {
      name: "Casper / Natrona County Public Safety Communications Center",
      address: "201 N. David St., Casper, WY 82601",
      nonEmergencyPhone: "(307) 235-8278",
      url: "https://www.casperwy.gov/",
      cadName: "Natrona County Sheriff & Casper PD",
      cadUrl: "https://www.natronacounty-wy.gov/",
    },
    scanners: [
      {
        id: "47444",
        name: "Natrona County Public Safety (WyoLink)",
        county: "Natrona County",
        city: "Casper",
        agencies: ["Casper Police", "Natrona County Sheriff", "WHP", "Fire & EMS"],
        system: "WyoLink P25 (Casper Mountain 800 MHz Node 5850)",
        primaryFrequency: "800 MHz WyoLink",
        listenUrl: "https://www.broadcastify.com/listen/feed/47444",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=47444",
        streamUrl: "https://broadcastify.cdnstream1.com/47444",
        callsNodeUrl: "https://www.broadcastify.com/calls/node/5850",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3136",
        featured: true,
      },
      {
        id: "32016",
        name: "Natrona County Fire and EMS Dispatch",
        county: "Natrona County",
        city: "Casper",
        agencies: ["Casper Fire-EMS", "Natrona County Fire District", "Mills Fire", "Wyoming Medical Center"],
        system: "WyoLink P25 (01-FD DSP 1, 01-FD TAC 4/5)",
        primaryFrequency: "800 MHz WyoLink",
        listenUrl: "https://www.broadcastify.com/listen/feed/32016",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=32016",
        streamUrl: "https://broadcastify.cdnstream1.com/32016",
        callsNodeUrl: "https://www.broadcastify.com/calls/node/5850",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3136",
      },
    ],
  },
  {
    id: "laramie",
    name: "Laramie",
    county: "Albany County",
    sameCode: "056001",
    observationStation: "KLAR",
    latitude: 41.31,
    longitude: -105.59,
    highways: ["I-80", "US-287", "US-30", "WY-130", "WY-230"],
    nwsZones: [
      { id: "WYZ115", name: "Laramie Valley" },
      { id: "WYZ116", name: "South Laramie Range" },
      { id: "WYZ428", name: "North Laramie Valley/Shirley Basin" },
      { id: "WYZ429", name: "South Laramie Range" },
    ],
    dispatch: {
      name: "Laramie / Albany County Records & Communications (LARC)",
      address: "420 E. Ivinson Ave., Laramie, WY 82070",
      nonEmergencyPhone: "(307) 721-2526",
      url: "https://www.cityoflaramie.org/257/Records-Communications-LARC",
    },
    scanners: [
      {
        id: "46691",
        name: "Albany County Public Safety",
        county: "Albany County",
        city: "Laramie",
        agencies: ["Laramie Police (05-LPD)", "Albany County Sheriff", "Laramie Fire/EMS (05-LFD)", "WHP"],
        system: "WyoLink P25 (TG 639 / TG 606 / TG 607)",
        primaryFrequency: "WyoLink VHF/800",
        listenUrl: "https://www.broadcastify.com/listen/feed/46691",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=46691",
        streamUrl: "https://broadcastify.cdnstream1.com/46691",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3124",
        featured: true,
      },
      {
        id: "30451",
        name: "UP Railroad Laramie Subdivision",
        county: "Albany County",
        city: "Laramie / Sherman Hill",
        agencies: ["Union Pacific Railroad Dispatcher & Road Channel (Sherman Hill / Cheyenne-Laramie)"],
        system: "AAR Rail VHF",
        primaryFrequency: "160.470 / 160.740 MHz",
        listenUrl: "https://www.broadcastify.com/listen/feed/30451",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=30451",
        streamUrl: "https://broadcastify.cdnstream1.com/30451",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3124",
      },
    ],
  },
  {
    id: "gillette",
    name: "Gillette",
    county: "Campbell County",
    sameCode: "056005",
    observationStation: "KGCC",
    noaaRadio: "WNG660 · 162.450 MHz",
    latitude: 44.29,
    longitude: -105.50,
    highways: ["I-90", "US-14", "US-16", "WY-59", "WY-51"],
    nwsZones: [
      { id: "WYZ054", name: "Northern Campbell" },
      { id: "WYZ055", name: "Southern Campbell" },
    ],
    dispatch: {
      name: "Campbell County Combined Communications Center",
      address: "600 W. Boxelder Rd., Gillette, WY 82718",
      nonEmergencyPhone: "(307) 682-7271",
      url: "https://www.gillettewy.gov/",
    },
    scanners: [
      {
        id: "6900",
        name: "Gillette Police, Campbell County Sheriff, Fire, EMS & WHP",
        county: "Campbell County",
        city: "Gillette",
        agencies: ["Gillette Police Dept", "Campbell County Sheriff", "Campbell County Fire Dept", "Campbell County Health EMS", "WHP"],
        system: "WyoLink P25 & Campbell County VHF",
        primaryFrequency: "WyoLink / VHF",
        listenUrl: "https://www.broadcastify.com/listen/feed/6900",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=6900",
        streamUrl: "https://broadcastify.cdnstream1.com/6900",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3126",
        featured: true,
      },
    ],
  },
  {
    id: "rock-springs",
    name: "Rock Springs",
    county: "Sweetwater County",
    sameCode: "056037",
    observationStation: "KRKS",
    latitude: 41.59,
    longitude: -109.20,
    highways: ["I-80", "US-191", "WY-430", "WY-370"],
    nwsZones: [{ id: "WYZ028", name: "Rock Springs and Green River" }],
    dispatch: {
      name: "Sweetwater Combined Communications Joint Powers Board",
      address: "50140B US-191, Rock Springs, WY 82901",
      nonEmergencyPhone: "(307) 362-6575",
      url: "https://www.sweetwater911.org/",
    },
    scanners: [
      {
        id: "44706",
        name: "Sweetwater County Radio / Public Safety Monitor",
        county: "Sweetwater County",
        city: "Rock Springs",
        agencies: ["Sweetwater County Communications", "SKYWARN / Repeater 146.940"],
        system: "Sweetwater VHF / WyoLink",
        primaryFrequency: "146.940 MHz / WyoLink",
        listenUrl: "https://www.broadcastify.com/listen/feed/44706",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=44706",
        streamUrl: "https://broadcastify.cdnstream1.com/44706",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3142",
      },
    ],
  },
  {
    id: "sheridan",
    name: "Sheridan",
    county: "Sheridan County",
    sameCode: "056033",
    observationStation: "KSHR",
    latitude: 44.80,
    longitude: -106.96,
    highways: ["I-90", "US-14", "US-87", "WY-335"],
    nwsZones: [{ id: "WYZ199", name: "Sheridan Foothills" }],
    dispatch: {
      name: "Sheridan Police / County Dispatch Center",
      address: "45 W. 12th St., Sheridan, WY 82801",
      nonEmergencyPhone: "(307) 672-2413",
      url: "https://www.sheridanwy.gov/",
    },
    scanners: [
      {
        id: "38973",
        name: "Sheridan County Public Safety",
        county: "Sheridan County",
        city: "Sheridan",
        agencies: ["Sheridan Police Dept", "Sheridan County Sheriff", "Sheridan Fire-Rescue", "WHP"],
        system: "WyoLink P25 & Sheridan VHF",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/feed/38973",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=38973",
        streamUrl: "https://broadcastify.cdnstream1.com/38973",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3140",
        featured: true,
      },
      {
        id: "43946",
        name: "Sheridan Fire and Rescue",
        county: "Sheridan County",
        city: "Sheridan",
        agencies: ["Sheridan Fire-Rescue", "Rural Fire Districts"],
        system: "VHF / WyoLink Fire Dispatch",
        primaryFrequency: "154.430 MHz",
        listenUrl: "https://www.broadcastify.com/listen/feed/43946",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=43946",
        streamUrl: "https://broadcastify.cdnstream1.com/43946",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3140",
      },
    ],
  },
  {
    id: "green-river",
    name: "Green River",
    county: "Sweetwater County",
    sameCode: "056037",
    observationStation: "KRKS",
    latitude: 41.53,
    longitude: -109.47,
    highways: ["I-80", "US-30", "WY-530", "WY-374"],
    nwsZones: [{ id: "WYZ028", name: "Rock Springs and Green River" }],
    dispatch: {
      name: "Sweetwater Combined Communications Joint Powers Board",
      nonEmergencyPhone: "(307) 875-1400",
      url: "https://www.sweetwater911.org/",
    },
    scanners: [
      {
        id: "44706",
        name: "Sweetwater County Radio / Public Safety Monitor",
        county: "Sweetwater County",
        city: "Green River",
        agencies: ["Green River Police/Fire", "Sweetwater County Sheriff", "SKYWARN"],
        system: "Sweetwater VHF / WyoLink",
        primaryFrequency: "146.940 MHz / WyoLink",
        listenUrl: "https://www.broadcastify.com/listen/feed/44706",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=44706",
        streamUrl: "https://broadcastify.cdnstream1.com/44706",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3142",
      },
    ],
  },
  {
    id: "evanston",
    name: "Evanston",
    county: "Uinta County",
    sameCode: "056041",
    observationStation: "KEVW",
    latitude: 41.27,
    longitude: -110.96,
    highways: ["I-80", "US-189", "WY-89"],
    nwsZones: [{ id: "WYZ021", name: "Southwest Wyoming" }],
    dispatch: {
      name: "Uinta County Combined Communications",
      nonEmergencyPhone: "(307) 783-1000",
      url: "https://www.uintacounty.com/",
    },
    scanners: [
      {
        id: "ctid-3144",
        name: "Uinta County WyoLink & I-80 West Corridor",
        county: "Uinta County",
        city: "Evanston",
        agencies: ["Evanston Police", "Uinta County Sheriff", "Uinta County Fire & EMS", "WHP"],
        system: "WyoLink P25 (WYOHS-19 TG 6219)",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/ctid/3144",
        popoutUrl: "https://www.broadcastify.com/listen/ctid/3144",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3144",
      },
    ],
  },
  {
    id: "riverton",
    name: "Riverton",
    county: "Fremont County",
    sameCode: "056013",
    observationStation: "KRIW",
    latitude: 43.03,
    longitude: -108.38,
    highways: ["US-26", "US-287", "WY-789", "WY-135"],
    nwsZones: [{ id: "WYZ017", name: "Wind River Basin" }],
    dispatch: {
      name: "Fremont County Dispatch / Riverton Police Communications",
      nonEmergencyPhone: "(307) 856-4891",
      url: "https://fremontcountywy.gov/",
    },
    scanners: [
      {
        id: "37816",
        name: "Fremont County Public Safety",
        county: "Fremont County",
        city: "Riverton / Lander",
        agencies: ["Riverton Police", "Fremont County Sheriff", "Lander Police", "Fremont County Fire & EMS", "WHP"],
        system: "WyoLink P25 & Fremont County VHF",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/feed/37816",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=37816",
        streamUrl: "https://broadcastify.cdnstream1.com/37816",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3130",
        featured: true,
      },
    ],
  },
  {
    id: "jackson",
    name: "Jackson",
    county: "Teton County",
    sameCode: "056039",
    observationStation: "KJAC",
    latitude: 43.48,
    longitude: -110.76,
    highways: ["US-26", "US-89", "US-191", "WY-22", "WY-390"],
    nwsZones: [
      { id: "WYZ013", name: "Jackson Hole" },
      { id: "WYZ012", name: "Teton and Gros Ventre Mountains" },
    ],
    dispatch: {
      name: "Teton County Sheriff / Jackson Hole Public Safety Dispatch",
      nonEmergencyPhone: "(307) 733-2331",
      url: "https://www.tetoncountywy.gov/",
    },
    scanners: [
      {
        id: "ctid-3143",
        name: "Teton County & Jackson Hole Public Safety",
        county: "Teton County",
        city: "Jackson",
        agencies: ["Jackson Police", "Teton County Sheriff", "Jackson Hole Fire/EMS", "Grand Teton NPS", "WHP"],
        system: "WyoLink P25 & Teton VHF",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/ctid/3143",
        popoutUrl: "https://www.broadcastify.com/listen/ctid/3143",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3143",
      },
    ],
  },
  {
    id: "cody",
    name: "Cody",
    county: "Park County",
    sameCode: "056029",
    observationStation: "KCOD",
    noaaRadio: "WNG563 · 162.475 MHz",
    latitude: 44.53,
    longitude: -109.06,
    highways: ["US-14", "US-16", "US-20", "WY-120", "WY-296"],
    nwsZones: [{ id: "WYZ003", name: "Cody Foothills" }],
    dispatch: {
      name: "Park County Communications Center",
      nonEmergencyPhone: "(307) 527-8700",
      url: "https://www.parkcounty-wy.gov/",
    },
    scanners: [
      {
        id: "42118",
        name: "Park County Public Safety - WyoLink",
        county: "Park County",
        city: "Cody",
        agencies: ["Cody Police", "Park County Sheriff", "Park County Fire District", "West Park Hospital EMS", "WHP"],
        system: "WyoLink P25 (McCullough Peaks Node 6218)",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/feed/42118",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=42118",
        streamUrl: "https://broadcastify.cdnstream1.com/42118",
        callsNodeUrl: "https://www.broadcastify.com/calls/node/6218",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3138",
        featured: true,
      },
    ],
  },
  {
    id: "rawlins",
    name: "Rawlins",
    county: "Carbon County",
    sameCode: "056007",
    observationStation: "KRWL",
    latitude: 41.79,
    longitude: -107.24,
    highways: ["I-80", "US-287", "WY-789", "WY-70"],
    nwsZones: [
      { id: "WYZ109", name: "Central Carbon County" },
      { id: "WYZ110", name: "North Snowy Range Foothills" },
      { id: "WYZ421", name: "Central and West Carbon" },
      { id: "WYZ422", name: "North Snowy Range Foothills" },
    ],
    dispatch: {
      name: "Carbon County Sheriff / Rawlins Dispatch",
      nonEmergencyPhone: "(307) 324-2776",
      url: "https://www.carbonwy.com/",
    },
    scanners: [
      {
        id: "24587",
        name: "Carbon County Public Safety (I-80 Elk Mtn / Rawlins)",
        county: "Carbon County",
        city: "Rawlins",
        agencies: ["Rawlins Police", "Carbon County Sheriff", "Rawlins Fire", "WHP I-80 Corridor"],
        system: "WyoLink P25 & Carbon County VHF",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/feed/24587",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=24587",
        streamUrl: "https://broadcastify.cdnstream1.com/24587",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3127",
        featured: true,
      },
    ],
  },
  {
    id: "lander",
    name: "Lander",
    county: "Fremont County",
    sameCode: "056013",
    observationStation: "KLND",
    latitude: 42.83,
    longitude: -108.73,
    highways: ["US-287", "WY-789", "WY-28", "WY-131"],
    nwsZones: [
      { id: "WYZ018", name: "Lander Foothills" },
      { id: "WYZ017", name: "Wind River Basin" },
    ],
    dispatch: {
      name: "Fremont County Sheriff / Lander Communications",
      nonEmergencyPhone: "(307) 332-9811",
      url: "https://fremontcountywy.gov/",
    },
    scanners: [
      {
        id: "37816",
        name: "Fremont County Public Safety",
        county: "Fremont County",
        city: "Lander / Riverton",
        agencies: ["Lander Police", "Fremont County Sheriff", "Riverton Police", "Fremont Fire & EMS"],
        system: "WyoLink P25 & Fremont County VHF",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/feed/37816",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=37816",
        streamUrl: "https://broadcastify.cdnstream1.com/37816",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3130",
      },
    ],
  },
  {
    id: "powell",
    name: "Powell",
    county: "Park County",
    sameCode: "056029",
    observationStation: "KPOY",
    latitude: 44.75,
    longitude: -108.76,
    highways: ["US-14A", "WY-295", "WY-120"],
    nwsZones: [{ id: "WYZ004", name: "North Big Horn Basin" }],
    dispatch: {
      name: "Powell Police Department Communications",
      nonEmergencyPhone: "(307) 754-2212",
      url: "https://www.cityofpowell.com/",
    },
    scanners: [
      {
        id: "2897",
        name: "Powell Police, Fire and EMS",
        county: "Park County",
        city: "Powell",
        agencies: ["Powell Police Dept", "Powell Volunteer Fire", "Powell Valley EMS", "Park County Sheriff"],
        system: "Park County VHF & WyoLink",
        primaryFrequency: "155.640 / 154.175 MHz",
        listenUrl: "https://www.broadcastify.com/listen/feed/2897",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=2897",
        streamUrl: "https://broadcastify.cdnstream1.com/2897",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3138",
      },
    ],
  },
  {
    id: "douglas",
    name: "Douglas",
    county: "Converse County",
    sameCode: "056009",
    observationStation: "KDGW",
    latitude: 42.76,
    longitude: -105.38,
    highways: ["I-25", "US-20", "US-26", "WY-59", "WY-94"],
    nwsZones: [
      { id: "WYZ101", name: "Converse County Lower Elevations" },
      { id: "WYZ418", name: "Middle North Platte River Basin/Niobrara and Converse High Plains" },
      { id: "WYZ419", name: "North Laramie Range and Adjacent High Plains" },
    ],
    dispatch: {
      name: "Converse County Joint Communications Center",
      nonEmergencyPhone: "(307) 358-4700",
      url: "https://conversecountywy.gov/",
    },
    scanners: [
      {
        id: "45835",
        name: "Converse County (Douglas/Glenrock) Public Safety",
        county: "Converse County",
        city: "Douglas",
        agencies: ["Douglas Police", "Converse County Sheriff", "Glenrock Police", "Converse Fire & EMS", "WHP"],
        system: "WyoLink P25 & Converse VHF",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/feed/45835",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=45835",
        streamUrl: "https://broadcastify.cdnstream1.com/45835",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3128",
      },
    ],
  },
  {
    id: "torrington",
    name: "Torrington",
    county: "Goshen County",
    sameCode: "056015",
    observationStation: "KTOR",
    latitude: 42.06,
    longitude: -104.18,
    highways: ["US-26", "US-85", "WY-154", "WY-92"],
    nwsZones: [
      { id: "WYZ108", name: "Goshen County" },
      { id: "WYZ433", name: "Goshen County Fire Zone" },
    ],
    dispatch: {
      name: "Goshen County / Torrington Communications Center",
      nonEmergencyPhone: "(307) 532-7001",
      url: "https://goshencounty.org/",
    },
    scanners: [
      {
        id: "46815",
        name: "Goshen County Public Safety",
        county: "Goshen County",
        city: "Torrington",
        agencies: ["Torrington Police", "Goshen County Sheriff", "Torrington Volunteer Fire", "Goshen EMS", "WHP"],
        system: "WyoLink P25 & Goshen VHF",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/feed/46815",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=46815",
        streamUrl: "https://broadcastify.cdnstream1.com/46815",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3131",
      },
      {
        id: "33051",
        name: "Fort Laramie Fire & Rescue",
        county: "Goshen County",
        city: "Fort Laramie / Torrington",
        agencies: ["Fort Laramie Fire (07-FLFD TG 1017)"],
        system: "WyoLink P25",
        primaryFrequency: "WyoLink TG 1017",
        listenUrl: "https://www.broadcastify.com/listen/feed/33051",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=33051",
        streamUrl: "https://broadcastify.cdnstream1.com/33051",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3131",
      },
    ],
  },
  {
    id: "worland",
    name: "Worland",
    county: "Washakie County",
    sameCode: "056043",
    observationStation: "KWRL",
    latitude: 44.02,
    longitude: -107.96,
    highways: ["US-16", "US-20", "WY-789"],
    nwsZones: [{ id: "WYZ005", name: "Southwest Bighorn Basin" }],
    dispatch: {
      name: "Washakie County / Worland Dispatch",
      nonEmergencyPhone: "(307) 347-2242",
      url: "https://www.washakiecounty.net/",
    },
    scanners: [
      {
        id: "30655",
        name: "Washakie County / Big Horn Basin NWARC Repeaters",
        county: "Washakie County",
        city: "Worland",
        agencies: ["Washakie County / Big Horn Basin Regional Emergency Net"],
        system: "VHF Regional Repeater",
        primaryFrequency: "VHF Repeater",
        listenUrl: "https://www.broadcastify.com/listen/feed/30655",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=30655",
        streamUrl: "https://broadcastify.cdnstream1.com/30655",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3145",
      },
    ],
  },
  {
    id: "buffalo",
    name: "Buffalo",
    county: "Johnson County",
    sameCode: "056019",
    observationStation: "KBYG",
    latitude: 44.35,
    longitude: -106.70,
    highways: ["I-90", "I-25", "US-16", "US-87"],
    nwsZones: [{ id: "WYZ011", name: "Southeast Johnson County" }],
    dispatch: {
      name: "Johnson County Sheriff / Buffalo Dispatch",
      nonEmergencyPhone: "(307) 684-5581",
      url: "https://www.johnsoncountywyoming.org/",
    },
    scanners: [
      {
        id: "ctid-3133",
        name: "Johnson County Public Safety (I-25 / I-90 Junction)",
        county: "Johnson County",
        city: "Buffalo",
        agencies: ["Buffalo Police", "Johnson County Sheriff", "Buffalo Fire", "WHP"],
        system: "WyoLink P25 (WYOHS-16 TG 6216)",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/ctid/3133",
        popoutUrl: "https://www.broadcastify.com/listen/ctid/3133",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3133",
      },
    ],
  },
  {
    id: "thermopolis",
    name: "Thermopolis",
    county: "Hot Springs County",
    sameCode: "056017",
    observationStation: "KTHP",
    latitude: 43.65,
    longitude: -108.21,
    highways: ["US-20", "WY-120", "WY-789"],
    nwsZones: [{ id: "WYZ006", name: "Southeast Bighorn Basin" }],
    dispatch: {
      name: "Hot Springs County Communications",
      nonEmergencyPhone: "(307) 864-2622",
      url: "https://www.hscounty.com/",
    },
    scanners: [
      {
        id: "44724",
        name: "Big Horn Basin Public Safety",
        county: "Hot Springs / Big Horn County",
        city: "Thermopolis / Basin",
        agencies: ["Big Horn Basin Law Enforcement, Fire & EMS", "WHP"],
        system: "WyoLink P25",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/feed/44724",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=44724",
        streamUrl: "https://broadcastify.cdnstream1.com/44724",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3132",
      },
    ],
  },
  {
    id: "wheatland",
    name: "Wheatland",
    county: "Platte County",
    sameCode: "056031",
    observationStation: "KEAN",
    latitude: 42.05,
    longitude: -104.96,
    highways: ["I-25", "US-26", "US-87", "WY-34", "WY-320"],
    nwsZones: [
      { id: "WYZ107", name: "East Platte County" },
      { id: "WYZ106", name: "Central Platte County" },
      { id: "WYZ432", name: "Bordeaux/Chugwater/Wheatland" },
    ],
    dispatch: {
      name: "Platte County Dispatch Center",
      nonEmergencyPhone: "(307) 322-2331",
      url: "https://www.plattecountywyoming.com/",
    },
    scanners: [
      {
        id: "33812",
        name: "Chugwater Fire Protection (I-25 Cheyenne–Wheatland Corridor)",
        county: "Platte / Laramie County",
        city: "Chugwater / Wheatland",
        agencies: ["Chugwater Fire (08-CHFD TG 1212, Laramie County FD #9 Mutual Aid)", "Platte County Fire"],
        system: "WyoLink P25 (TG 1212)",
        primaryFrequency: "WyoLink TG 1212",
        listenUrl: "https://www.broadcastify.com/listen/feed/33812",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=33812",
        streamUrl: "https://broadcastify.cdnstream1.com/33812",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3139",
      },
      {
        id: "34634",
        name: "Guernsey Fire & Rescue",
        county: "Platte County",
        city: "Guernsey / Wheatland",
        agencies: ["Guernsey Fire", "Platte County Mutual Aid"],
        system: "WyoLink P25 & VHF",
        primaryFrequency: "WyoLink VHF",
        listenUrl: "https://www.broadcastify.com/listen/feed/34634",
        popoutUrl: "https://www.broadcastify.com/listen/feed/popout.php?feedId=34634",
        streamUrl: "https://broadcastify.cdnstream1.com/34634",
        radioReferenceUrl: "https://www.radioreference.com/db/browse/ctid/3139",
      },
    ],
  },
];

export const ALL_WYOMING_SCANNER_FEEDS: readonly WyomingScannerFeed[] = Array.from(
  new Map(
    WYOMING_CITIES.flatMap((city) => city.scanners).map((feed) => [feed.id, feed]),
  ).values(),
);

export const WYOMING_CITY_BY_ID: Record<string, WyomingCity> = Object.fromEntries(
  WYOMING_CITIES.map((city) => [city.id, city]),
);
