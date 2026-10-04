export interface WyomingForecastZone {
  /** National Weather Service public forecast-zone identifier. */
  id: string;
  name: string;
}

export interface WyomingCity {
  id: string;
  name: string;
  county: string;
  /** Approximate city-center coordinates used for the NWS point forecast. */
  latitude: number;
  longitude: number;
  highways: readonly string[];
  /** Forecast zones that most directly cover the city and its immediate area. */
  nwsZones: readonly WyomingForecastZone[];
}

/**
 * City-center reference points for Wyoming Pulse. NWS forecast zones cover
 * broader forecast areas and do not follow municipal boundaries; use an alert's
 * official polygon and text for its exact affected area.
 */
export const WYOMING_CITIES = [
  {
    id: "cheyenne",
    name: "Cheyenne",
    county: "Laramie County",
    latitude: 41.14,
    longitude: -104.82,
    highways: ["I-25", "I-80", "US-85", "US-30"],
    nwsZones: [{ id: "WYZ118", name: "Central Laramie County" }],
  },
  {
    id: "casper",
    name: "Casper",
    county: "Natrona County",
    latitude: 42.85,
    longitude: -106.32,
    highways: ["I-25", "US-20", "US-26", "US-87", "WY-220"],
    nwsZones: [
      { id: "WYZ020", name: "Natrona County Lower Elevations" },
      { id: "WYZ022", name: "Casper Mountain" },
    ],
  },
  {
    id: "laramie",
    name: "Laramie",
    county: "Albany County",
    latitude: 41.31,
    longitude: -105.59,
    highways: ["I-80", "US-287", "WY-130"],
    nwsZones: [{ id: "WYZ115", name: "Laramie Valley" }],
  },
  {
    id: "gillette",
    name: "Gillette",
    county: "Campbell County",
    latitude: 44.29,
    longitude: -105.50,
    highways: ["I-90", "US-14", "US-16", "WY-59"],
    nwsZones: [{ id: "WYZ054", name: "Northern Campbell" }],
  },
  {
    id: "rock-springs",
    name: "Rock Springs",
    county: "Sweetwater County",
    latitude: 41.59,
    longitude: -109.20,
    highways: ["I-80", "US-191", "WY-430"],
    nwsZones: [{ id: "WYZ028", name: "Rock Springs and Green River" }],
  },
  {
    id: "sheridan",
    name: "Sheridan",
    county: "Sheridan County",
    latitude: 44.80,
    longitude: -106.96,
    highways: ["I-90", "US-14", "US-87"],
    nwsZones: [{ id: "WYZ199", name: "Sheridan Foothills" }],
  },
  {
    id: "green-river",
    name: "Green River",
    county: "Sweetwater County",
    latitude: 41.53,
    longitude: -109.47,
    highways: ["I-80", "US-30", "WY-530"],
    nwsZones: [{ id: "WYZ028", name: "Rock Springs and Green River" }],
  },
  {
    id: "evanston",
    name: "Evanston",
    county: "Uinta County",
    latitude: 41.27,
    longitude: -110.96,
    highways: ["I-80", "US-189"],
    nwsZones: [{ id: "WYZ021", name: "Southwest Wyoming" }],
  },
  {
    id: "riverton",
    name: "Riverton",
    county: "Fremont County",
    latitude: 43.03,
    longitude: -108.38,
    highways: ["US-26", "US-287", "WY-789"],
    nwsZones: [{ id: "WYZ017", name: "Wind River Basin" }],
  },
  {
    id: "jackson",
    name: "Jackson",
    county: "Teton County",
    latitude: 43.48,
    longitude: -110.76,
    highways: ["US-26", "US-89", "US-191"],
    nwsZones: [{ id: "WYZ013", name: "Jackson Hole" }],
  },
  {
    id: "cody",
    name: "Cody",
    county: "Park County",
    latitude: 44.53,
    longitude: -109.06,
    highways: ["US-14", "US-16", "US-20", "WY-120"],
    nwsZones: [{ id: "WYZ003", name: "Cody Foothills" }],
  },
  {
    id: "rawlins",
    name: "Rawlins",
    county: "Carbon County",
    latitude: 41.79,
    longitude: -107.24,
    highways: ["I-80", "US-287", "WY-789"],
    nwsZones: [{ id: "WYZ109", name: "Central Carbon County" }],
  },
  {
    id: "lander",
    name: "Lander",
    county: "Fremont County",
    latitude: 42.83,
    longitude: -108.73,
    highways: ["US-287", "WY-789"],
    nwsZones: [{ id: "WYZ018", name: "Lander Foothills" }],
  },
  {
    id: "powell",
    name: "Powell",
    county: "Park County",
    latitude: 44.75,
    longitude: -108.76,
    highways: ["US-14A", "WY-295", "WY-120"],
    nwsZones: [{ id: "WYZ004", name: "North Big Horn Basin" }],
  },
  {
    id: "douglas",
    name: "Douglas",
    county: "Converse County",
    latitude: 42.76,
    longitude: -105.38,
    highways: ["I-25", "US-20", "US-26", "WY-59"],
    nwsZones: [{ id: "WYZ101", name: "Converse County Lower Elevations" }],
  },
  {
    id: "torrington",
    name: "Torrington",
    county: "Goshen County",
    latitude: 42.06,
    longitude: -104.18,
    highways: ["US-26", "US-85", "WY-154"],
    nwsZones: [{ id: "WYZ108", name: "Goshen County" }],
  },
  {
    id: "worland",
    name: "Worland",
    county: "Washakie County",
    latitude: 44.02,
    longitude: -107.96,
    highways: ["US-16", "WY-789"],
    nwsZones: [{ id: "WYZ005", name: "Southwest Bighorn Basin" }],
  },
  {
    id: "buffalo",
    name: "Buffalo",
    county: "Johnson County",
    latitude: 44.35,
    longitude: -106.70,
    highways: ["I-90", "US-16", "US-87"],
    nwsZones: [{ id: "WYZ011", name: "Southeast Johnson County" }],
  },
  {
    id: "thermopolis",
    name: "Thermopolis",
    county: "Hot Springs County",
    latitude: 43.65,
    longitude: -108.21,
    highways: ["US-20", "WY-120"],
    nwsZones: [{ id: "WYZ006", name: "Southeast Bighorn Basin" }],
  },
  {
    id: "wheatland",
    name: "Wheatland",
    county: "Platte County",
    latitude: 42.05,
    longitude: -104.96,
    highways: ["I-25", "US-26", "US-87"],
    nwsZones: [{ id: "WYZ107", name: "East Platte County" }],
  },
] as const satisfies readonly WyomingCity[];

export const WYOMING_CITY_BY_ID = Object.fromEntries(
  WYOMING_CITIES.map((city) => [city.id, city]),
) as Record<(typeof WYOMING_CITIES)[number]["id"], (typeof WYOMING_CITIES)[number]>;
