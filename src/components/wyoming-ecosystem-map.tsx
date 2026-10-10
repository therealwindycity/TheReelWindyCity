"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as CivicMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { LocateFixed, MapPin, Minus, Plus } from "lucide-react";
import { asset } from "@/lib/civic-data";
import { architectureById, statusLabel, type ArchitectureId, type TacticStatus } from "@/lib/wyoming-ecosystem";

export type EcosystemMapPoint = {
  id: string;
  layer: "municipality" | "county";
  name: string;
  kind: string;
  countyName: string;
  architectureId: ArchitectureId;
  tacticStatus: TacticStatus;
  website: string | null;
  verification: string | null;
  longitude: number;
  latitude: number;
  href: string;
  civicHref: string;
};

const COLORS: Record<ArchitectureId, string> = {
  "granicus-publisher": "#315d43",
  "civicplus-agenda-center": "#2b6f9a",
  "civicplus-cms-page": "#2f7f78",
  "clerk-file-index": "#a56b28",
  "pdf-packet-folder": "#b85a32",
  "clerk-html-page": "#4f6284",
  "county-site-unobserved": "#6d4d86",
  unobserved: "#8b9289",
};

const CENTER: [number, number] = [-107.55, 43.05];

function collection(points: EcosystemMapPoint[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      properties: {
        id: point.id,
        layer: point.layer,
        name: point.name,
        color: point.layer === "county" ? "#6d4d86" : COLORS[point.architectureId],
      },
      geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
    })),
  };
}

export default function WyomingEcosystemMap({ points }: { points: EcosystemMapPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<CivicMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<"all" | "municipalities" | "counties" | ArchitectureId>("all");
  const [selectedId, setSelectedId] = useState<string>("place-cheyenne");
  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
  });

  const visible = useMemo(() => points.filter((point) => {
    if (filter === "all") return true;
    if (filter === "municipalities") return point.layer === "municipality";
    if (filter === "counties") return point.layer === "county";
    return point.architectureId === filter;
  }), [points, filter]);

  const selected = points.find((point) => point.id === selectedId) ?? visible[0] ?? points[0];

  useEffect(() => {
    let cancelled = false;
    import("maplibre-gl").then((ML) => {
      if (cancelled || !container.current || mapRef.current) return;
      ML.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
      const map = new ML.Map({
        container: container.current,
        style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron",
        center: CENTER,
        zoom: 5.45,
        minZoom: 4.4,
        maxZoom: 13,
        scrollZoom: false,
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      let errors = 0;
      map.on("error", (event) => {
        if (!cancelled && (++errors > 5 || /worker|webgl|style/i.test(event.error?.message || ""))) setFailed(true);
      });
      map.on("load", () => {
        if (cancelled) return;
        map.addSource("sites", { type: "geojson", data: collection(pointsRef.current) });
        map.addLayer({
          id: "county-rings",
          type: "circle",
          source: "sites",
          filter: ["==", ["get", "layer"], "county"],
          paint: {
            "circle-radius": 13,
            "circle-color": "rgba(109,77,134,0.08)",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#6d4d86",
          },
        });
        map.addLayer({
          id: "place-dots",
          type: "circle",
          source: "sites",
          filter: ["==", ["get", "layer"], "municipality"],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4.5, 9, 8],
            "circle-color": ["get", "color"],
            "circle-stroke-width": 1.4,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.on("click", (event) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: ["place-dots", "county-rings"] })[0];
          const id = feature?.properties?.id;
          if (typeof id === "string") setSelectedId(id);
        });
        map.on("mouseenter", "place-dots", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "place-dots", () => { map.getCanvas().style.cursor = ""; });
        map.on("mouseenter", "county-rings", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "county-rings", () => { map.getCanvas().style.cursor = ""; });
        setReady(true);
      });
      const observer = new ResizeObserver(() => map.resize());
      observer.observe(container.current);
      map.on("remove", () => observer.disconnect());
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("sites") as GeoJSONSource | undefined)?.setData(collection(visible));
  }, [visible, ready]);

  useEffect(() => {
    if (!ready || !selected) return;
    mapRef.current?.flyTo({ center: [selected.longitude, selected.latitude], zoom: selected.layer === "county" ? 7.2 : 8.4, duration: 700 });
  }, [selected, ready]);

  return (
    <div className="eco-map-layout">
      <div className="eco-map-canvas-wrap">
        <div className="eco-map-canvas" ref={container} role="application" aria-label="Map of Wyoming city and county government reference points. Markers are not legal boundaries." />
        <div className="eco-map-place"><MapPin size={13} aria-hidden="true" /> Wyoming · reference points, not boundaries</div>
        <div className="custom-map-controls">
          <button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus size={17} /></button>
          <button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus size={17} /></button>
          <button type="button" aria-label="Reset map to Wyoming" onClick={() => mapRef.current?.flyTo({ center: CENTER, zoom: 5.45 })}><LocateFixed size={17} /></button>
        </div>
        {!ready && !failed && <div className="map-loading">Loading Wyoming’s map…</div>}
        {failed && <div className="map-unavailable"><MapPin size={22} /><strong>Map tiles are unavailable</strong><span>The directory beside the map still lists every site.</span></div>}
      </div>
      <div className="eco-map-side">
        <div className="eco-filters" role="group" aria-label="Filter mapped governments">
          {([
            ["all", "All"],
            ["municipalities", "Cities & towns"],
            ["counties", "Counties"],
            ["granicus-publisher", "Granicus"],
            ["civicplus-agenda-center", "Agenda Center"],
            ["unobserved", "Unobserved"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        {selected && (
          <article className="eco-map-card">
            <p className="gov-kicker">{selected.layer === "county" ? "COUNTY" : selected.kind.toUpperCase()} · {selected.countyName}</p>
            <h3>{selected.name}</h3>
            <p>{architectureById(selected.architectureId).name}</p>
            <p><strong>{statusLabel(selected.tacticStatus)}</strong></p>
            {selected.website ? <a href={selected.website} target="_blank" rel="noopener noreferrer">{selected.website.replace(/^https?:\/\//, "")}</a> : <p>No confirmed public website in this catalog.</p>}
            <a className="gov-text-link" href={asset(selected.civicHref)}>Open this civic</a>
            <a className="gov-text-link" href={asset(selected.href)}>Open the ecosystem record</a>
          </article>
        )}
        <ul className="eco-map-list" aria-label="Governments in the current filter">
          {visible.map((point) => (
            <li key={point.id}>
              <button type="button" className={point.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(point.id)}>
                <i style={{ background: point.layer === "county" ? "#6d4d86" : COLORS[point.architectureId] }} />
                <span><strong>{point.name}</strong><small>{point.layer === "county" ? "County site" : point.countyName}</small></span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
