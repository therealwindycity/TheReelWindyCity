/**
 * Wyoming Pulse — Alert Ingestion Engine (Client-Side)
 * 
 * Since this app deploys as static HTML to GitHub Pages,
 * all data fetching happens in the browser. The NWS and
 * WYDOT APIs support CORS, so direct browser fetch works.
 */

// ─── Types ───────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'urgent' | 'standard' | 'informational';
export type AlertCategory = 'weather' | 'road_conditions' | 'fire' | 'crime' | 'accident' | 'government' | 'court' | 'election' | 'environment' | 'community' | 'breaking';

export interface PulseAlert {
  source: string;
  source_id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  summary: string;
  full_text?: string;
  location: {
    lat?: number;
    lng?: number;
    county?: string;
    city?: string;
    highway?: string;
    mile_marker?: number;
  };
  event_time: string;
  ingested_at: string;
  tags: string[];
}

export interface IngestionResult {
  alerts: PulseAlert[];
  counts: Record<string, number>;
  timestamp: string;
  errors: string[];
}

// ─── NWS Wyoming Zones ───────────────────────────────────

const NWS_WY_ZONES = [
  'WYZ001','WYZ002','WYZ003','WYZ004','WYZ005',
  'WYZ006','WYZ007','WYZ008','WYZ009','WYZ010',
  'WYZ011','WYZ012','WYZ013','WYZ014','WYZ015',
  'WYZ016','WYZ017','WYZ018','WYZ019','WYZ020',
  'WYZ021','WYZ022','WYZ023','WYZ024','WYZ025',
  'WYZ026','WYZ027',
];

const SEVERITY_MAP: Record<string, AlertSeverity> = {
  'Extreme': 'critical',
  'Severe': 'urgent',
  'Moderate': 'standard',
  'Minor': 'informational',
};

const EVENT_CATEGORY_MAP: Record<string, AlertCategory> = {
  'Tornado Warning': 'weather',
  'Severe Thunderstorm Warning': 'weather',
  'Winter Storm Warning': 'weather',
  'Winter Storm Watch': 'weather',
  'Blizzard Warning': 'weather',
  'High Wind Warning': 'weather',
  'High Wind Watch': 'weather',
  'Fire Weather Watch': 'fire',
  'Red Flag Warning': 'fire',
  'Flash Flood Warning': 'weather',
  'Flood Warning': 'weather',
  'Dense Fog Advisory': 'road_conditions',
  'Winter Weather Advisory': 'weather',
  'Wind Advisory': 'weather',
  'Dust Advisory': 'road_conditions',
};

// ─── NWS Fetch ───────────────────────────────────────────

async function fetchNWSAlerts(): Promise<PulseAlert[]> {
  try {
    const zoneParams = NWS_WY_ZONES.map(z => `zone=${z}`).join('&');
    const resp = await fetch(`https://api.weather.gov/alerts/active?${zoneParams}`, {
      headers: { 'User-Agent': '(CivicCheyenne, civic-cheyenne@example.com)' },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.features || []).map((f: Record<string, unknown>) => {
      const p = f.properties as Record<string, unknown>;
      return {
        source: 'nws',
        source_id: f.id as string,
        severity: SEVERITY_MAP[p.severity as string] || 'standard',
        category: EVENT_CATEGORY_MAP[p.event as string] || 'weather',
        title: (p.headline as string) || `${p.event} — ${p.areaDesc}`,
        summary: ((p.description as string) || '').substring(0, 500),
        full_text: p.description as string,
        location: { county: p.areaDesc as string },
        event_time: (p.onset as string) || (p.effective as string) || (p.sent as string),
        ingested_at: new Date().toISOString(),
        tags: [p.event, p.urgency, p.certainty].filter(Boolean) as string[],
      } satisfies PulseAlert;
    });
  } catch {
    return [];
  }
}

// ─── WYDOT Road Conditions ───────────────────────────────

async function fetchWYDOTRoadConditions(): Promise<PulseAlert[]> {
  try {
    // WYDOT publishes road events via their public API
    const resp = await fetch('https://www.wyoroad.info/highway/webmap/json/events.json');
    if (!resp.ok) return [];
    const data = await resp.json();
    const events = (data.events || data || []) as Record<string, unknown>[];
    return events
      .filter((e) => {
        const cond = ((e.roadCondition as string) || '').toLowerCase();
        return cond.includes('closed') || cond.includes('chain') || cond.includes('incident') || cond.includes('hazardous');
      })
      .map((e) => {
        const cond = ((e.roadCondition as string) || '').toLowerCase();
        const isClosed = cond.includes('closed');
        return {
          source: 'wydot',
          source_id: `wydot-${e.id}`,
          severity: isClosed ? 'urgent' as AlertSeverity : 'standard' as AlertSeverity,
          category: 'road_conditions' as AlertCategory,
          title: `${e.roadName} ${isClosed ? 'CLOSED' : e.roadCondition}: ${e.fromLocation} to ${e.toLocation}`,
          summary: `${e.roadName}: ${e.description || e.roadCondition} between ${e.fromLocation} and ${e.toLocation}.`,
          location: {
            lat: e.latitude as number,
            lng: e.longitude as number,
            highway: e.roadName as string,
          },
          event_time: (e.updated as string) || (e.created as string),
          ingested_at: new Date().toISOString(),
          tags: ['wydot', 'road', e.roadCondition as string].filter(Boolean),
        } satisfies PulseAlert;
      });
  } catch {
    return [];
  }
}

// ─── RSS Feed Monitor ────────────────────────────────────

const WY_RSS_FEEDS = [
  { name: 'Oil City News', url: 'https://oilcity.news/feed/' },
  { name: 'Cap City News', url: 'https://capcity.news/feed/' },
  { name: 'WyoFile', url: 'https://wyofile.com/feed/' },
  { name: 'Buckrail', url: 'https://buckrail.com/feed/' },
  { name: 'County 10', url: 'https://county10.com/feed/' },
  { name: 'SweetwaterNOW', url: 'https://www.sweetwaternow.com/feed/' },
];

function parseRSSItems(xml: string, feedName: string): PulseAlert[] {
  const items: PulseAlert[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]?.trim() || '';
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || '';
    const desc = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]?.trim() || '';
    if (!title) continue;

    const isCrime = /crime|arrest|police|court/i.test(title);
    const isBreaking = /breaking|urgent|emergency/i.test(title);
    const isAccident = /crash|accident|collision|killed|fatal/i.test(title);

    items.push({
      source: `rss-${feedName.toLowerCase().replace(/\s/g, '-')}`,
      source_id: link || `${feedName}-${title}`,
      severity: isBreaking ? 'urgent' : isCrime || isAccident ? 'standard' : 'informational',
      category: isCrime ? 'crime' : isAccident ? 'accident' : 'community',
      title,
      summary: desc.replace(/<[^>]*>/g, '').substring(0, 300),
      location: {},
      event_time: pubDate || new Date().toISOString(),
      ingested_at: new Date().toISOString(),
      tags: [feedName],
    });
  }
  return items.slice(0, 5);
}

async function fetchRSSFeeds(): Promise<PulseAlert[]> {
  const allAlerts: PulseAlert[] = [];
  await Promise.allSettled(
    WY_RSS_FEEDS.map(async (feed) => {
      try {
        const resp = await fetch(feed.url);
        if (!resp.ok) return;
        const xml = await resp.text();
        allAlerts.push(...parseRSSItems(xml, feed.name));
      } catch { /* ignore */ }
    })
  );
  return allAlerts;
}

// ─── Main Ingestion Pipeline ─────────────────────────────

export async function runPulseIngestion(): Promise<IngestionResult> {
  const errors: string[] = [];
  const counts: Record<string, number> = {};

  const results = await Promise.allSettled([
    fetchNWSAlerts(),
    fetchWYDOTRoadConditions(),
    fetchRSSFeeds(),
  ]);

  const allAlerts: PulseAlert[] = [];

  if (results[0].status === 'fulfilled') {
    allAlerts.push(...results[0].value);
    counts['nws'] = results[0].value.length;
  } else {
    errors.push(`NWS: ${results[0].reason}`);
    counts['nws'] = 0;
  }

  if (results[1].status === 'fulfilled') {
    allAlerts.push(...results[1].value);
    counts['wydot'] = results[1].value.length;
  } else {
    errors.push(`WYDOT: ${results[1].reason}`);
    counts['wydot'] = 0;
  }

  if (results[2].status === 'fulfilled') {
    allAlerts.push(...results[2].value);
    counts['rss'] = results[2].value.length;
  } else {
    errors.push(`RSS: ${results[2].reason}`);
    counts['rss'] = 0;
  }

  // Sort by severity then event_time
  const severityOrder: Record<string, number> = { critical: 0, urgent: 1, standard: 2, informational: 3 };
  allAlerts.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.event_time).getTime() - new Date(a.event_time).getTime();
  });

  counts['total'] = allAlerts.length;

  // If no live data (CORS/network issues), use demo data
  if (allAlerts.length === 0) {
    return getDemoResult(errors);
  }

  return { alerts: allAlerts, counts, timestamp: new Date().toISOString(), errors };
}

// ─── Demo Data ───────────────────────────────────────────

function getDemoResult(errors: string[]): IngestionResult {
  const now = new Date();
  const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  const demo: PulseAlert[] = [
    { source: 'nws', source_id: 'demo-1', severity: 'urgent', category: 'weather', title: 'Winter Storm Warning — Casper, Douglas, Lander', summary: 'Heavy snow expected. Total accumulations of 8 to 14 inches. Winds gusting as high as 45 mph.', location: { county: 'Natrona, Converse, Fremont', lat: 42.86, lng: -106.31 }, event_time: ago(15), ingested_at: ago(2), tags: ['Winter Storm Warning'] },
    { source: 'wydot', source_id: 'demo-2', severity: 'urgent', category: 'road_conditions', title: 'I-80 CLOSED: Elk Mountain to Rawlins — High Winds', summary: 'Interstate 80 closed in both directions between Elk Mountain (MM 228) and Rawlins (MM 323) due to high winds.', location: { highway: 'I-80', county: 'Carbon', lat: 41.69, lng: -107.24 }, event_time: ago(35), ingested_at: ago(5), tags: ['I-80', 'Closed'] },
    { source: 'wydot', source_id: 'demo-3', severity: 'standard', category: 'road_conditions', title: 'I-25 Chain Law: Cheyenne to Wheatland', summary: 'Chain law in effect for light vehicles on Interstate 25 between Cheyenne and Wheatland.', location: { highway: 'I-25', county: 'Laramie', lat: 41.31, lng: -104.82 }, event_time: ago(42), ingested_at: ago(5), tags: ['I-25', 'Chain Law'] },
    { source: 'rss-oilcitynews', source_id: 'demo-4', severity: 'standard', category: 'crime', title: 'Swatting incident at Banner Wyoming Medical Center', summary: 'Casper police responded to a false report of an active shooter at the hospital.', location: { city: 'Casper', county: 'Natrona' }, event_time: ago(180), ingested_at: ago(30), tags: ['Crime'] },
    { source: 'rss-capcitynews', source_id: 'demo-5', severity: 'standard', category: 'accident', title: '2 Czech Republic residents killed in crash near Pinedale', summary: 'Two killed in single-vehicle crash on US 191 near Pinedale.', location: { highway: 'US-191', county: 'Sublette' }, event_time: ago(120), ingested_at: ago(60), tags: ['Accident', 'Fatal'] },
    { source: 'rss-wyofile', source_id: 'demo-6', severity: 'standard', category: 'court', title: 'Judge denies qualified immunity to Wyoming Boys\' School staff', summary: 'A federal judge has denied qualified immunity in an abuse lawsuit.', location: { city: 'Worland', county: 'Washakie' }, event_time: ago(1440), ingested_at: ago(60), tags: ['Court'] },
    { source: 'rss-cowboystatedaily', source_id: 'demo-7', severity: 'standard', category: 'community', title: 'Landowners fed up with new breed of trespassers', summary: 'Ranchers across Wyoming report increasing unauthorized access to private land.', location: { county: 'Statewide' }, event_time: ago(300), ingested_at: ago(15), tags: ['Community'] },
    { source: 'nws', source_id: 'demo-8', severity: 'informational', category: 'weather', title: 'Dense Fog Advisory — Sheridan, Gillette, Buffalo', summary: 'Visibility one quarter mile or less in dense fog.', location: { county: 'Sheridan, Campbell, Johnson' }, event_time: ago(90), ingested_at: ago(2), tags: ['Dense Fog Advisory'] },
  ];

  return {
    alerts: demo,
    counts: { total: demo.length, nws: 2, wydot: 2, rss: 4 },
    timestamp: now.toISOString(),
    errors: [...errors, 'Demo data loaded — live APIs returned empty or were unreachable from this browser.'],
  };
}