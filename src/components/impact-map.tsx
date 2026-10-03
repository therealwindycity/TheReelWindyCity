"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as CivicMap, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { LocateFixed, MapPin, Plus, Minus } from "lucide-react";
import { ORDINANCES, CITY_HALL_COORDINATES, EAST_CHEYENNE_COORDINATES, asset, type Ordinance } from "@/lib/civic-data";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
function generalArea(center: [number,number]): FeatureCollection {
  const [lat,lon] = center;
  const coordinates = Array.from({length:65}, (_,i) => { const angle = i / 64 * Math.PI * 2; return [lon + 650 / (111320 * Math.cos(lat*Math.PI/180)) * Math.cos(angle), lat + 650 / 111320 * Math.sin(angle)]; });
  return { type:"FeatureCollection", features:[{type:"Feature",properties:{notice:"General agenda location, not legal parcel boundaries"},geometry:{type:"Polygon",coordinates:[coordinates]}}] };
}

export default function ImpactMap({ selected, onSelect, expanded = false, proposed = true }: { selected?: Ordinance; onSelect: (id: string) => void; expanded?: boolean; proposed?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<CivicMap | null>(null);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("maplibre-gl").then((ML) => {
      if (cancelled || !container.current || mapRef.current) return;
      ML.setWorkerUrl(asset("maps/maplibre-gl-worker.mjs"));
      const map = new ML.Map({ container:container.current, style:process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron", center:[-104.793,41.15], zoom:11, minZoom:9, maxZoom:18, scrollZoom:false, dragRotate:false, pitchWithRotate:false, attributionControl:{compact:false}, canvasContextAttributes:{preserveDrawingBuffer:true} });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      let errors = 0;
      map.on("error", (event) => { if (!cancelled && (++errors > 5 || /worker|webgl|style/i.test(event.error?.message || ""))) setFailed(true); });
      const hall = window.document.createElement("button");
      hall.className = "civic-map-marker";
      hall.setAttribute("aria-label","City Hall · citywide policy reference location");
      hall.title = "City Hall · citywide policies";
      hall.innerHTML = '<span class="map-marker-hall"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 9 9-6 9 6M4 10h16M6 10v9m6-9v9m6-9v9M3 20h18"/></svg></span>';
      hall.addEventListener("click", () => callback.current("2026-01-26-adu"));
      new ML.Marker({element:hall}).setLngLat([CITY_HALL_COORDINATES[1],CITY_HALL_COORDINATES[0]]).addTo(map);
      const east = window.document.createElement("button");
      east.className = "civic-map-marker";
      east.setAttribute("aria-label","East Cheyenne · general annexation and zoning area");
      east.title = "East Cheyenne · general agenda area, not surveyed boundaries";
      east.innerHTML = '<span class="map-marker-east"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/></svg></span>';
      east.addEventListener("click", () => callback.current("2026-01-26-annexation"));
      new ML.Marker({element:east}).setLngLat([EAST_CHEYENNE_COORDINATES[1],EAST_CHEYENNE_COORDINATES[0]]).addTo(map);
      map.on("load", () => {
        if (cancelled) return;
        map.addSource("ordinance-area",{type:"geojson",data:EMPTY});
        map.addLayer({id:"ordinance-area-fill",type:"fill",source:"ordinance-area",paint:{"fill-color":"#91b4d3","fill-opacity":0.16}});
        map.addLayer({id:"ordinance-area-line",type:"line",source:"ordinance-area",paint:{"line-color":"#557faa","line-width":2,"line-dasharray":[3,4]}});
        map.addSource("ordinance-reference",{type:"geojson",data:EMPTY});
        map.addLayer({id:"ordinance-reference-ring",type:"circle",source:"ordinance-reference",paint:{"circle-radius":27,"circle-opacity":0,"circle-stroke-width":2,"circle-stroke-color":"#628c4c","circle-stroke-opacity":0.8}});
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
    const area = map.getSource("ordinance-area") as GeoJSONSource;
    const reference = map.getSource("ordinance-reference") as GeoJSONSource;
    area.setData(selected?.scope === "east" ? generalArea(selected.center) : EMPTY);
    reference.setData(selected?.scope === "citywide" ? {type:"FeatureCollection",features:[{type:"Feature",properties:{notice:"City Hall reference for a citywide policy, not an affected parcel"},geometry:{type:"Point",coordinates:[CITY_HALL_COORDINATES[1],CITY_HALL_COORDINATES[0]]}}]} : EMPTY);
    map.setPaintProperty("ordinance-area-fill","fill-opacity",proposed ? 0.16 : 0.04);
    map.setPaintProperty("ordinance-area-line","line-color",proposed ? "#557faa" : "#9aa8b4");
    map.setPaintProperty("ordinance-reference-ring","circle-stroke-color",proposed ? "#628c4c" : "#8c9690");
    if (selected) map.flyTo({center:[selected.center[1],selected.center[0]],zoom:selected.zoom-1,duration:700});
    else map.jumpTo({center:[-104.793,41.15],zoom:11});
  }, [selected, proposed, ready]);
  return <div className={`impact-map ${expanded ? "expanded" : ""}`}>
    <div className="map-canvas" ref={container} aria-label="Interactive map of Cheyenne. Select City Hall or the East Cheyenne general-area marker." />
    <div className="map-place"><MapPin size={13}/> Cheyenne, Wyoming</div>
    <div className="custom-map-controls"><button aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus size={17}/></button><button aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus size={17}/></button><button aria-label="Reset map to Cheyenne" onClick={() => mapRef.current?.flyTo({center:[-104.793,41.15],zoom:11})}><LocateFixed size={17}/></button></div>
    {!ready && !failed && <div className="map-loading">Loading Cheyenne’s map…</div>}
    {failed && <div className="map-unavailable"><MapPin size={22}/><strong>Map tiles are unavailable</strong><span>The source-backed impact details remain accessible.</span><button onClick={() => callback.current(ORDINANCES[1].id)}>Explore East Cheyenne</button></div>}
    <div className="map-legend"><span><i className="legend-green"/> Citywide policy</span><span><i className="legend-blue"/> General ordinance area</span></div>
  </div>;
}
