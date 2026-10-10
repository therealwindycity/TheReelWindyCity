"use client";

import { useMemo, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { asset } from "@/lib/civic-data";
import { searchCivicPlaces } from "@/lib/civic-places";

export function PlacePicker({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const places = useMemo(() => searchCivicPlaces(query).slice(0, 80), [query]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="meeting-picker-modal place-picker-modal" role="dialog" aria-modal="true" aria-labelledby="place-picker-title" onClick={(event) => event.stopPropagation()}>
        <div className="meeting-picker-heading">
          <div>
            <span className="eyebrow">SWITCH THE WHOLE CIVIC</span>
            <h2 id="place-picker-title">Open another Wyoming government.</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close place picker" onClick={onClose}><X size={21} /></button>
        </div>
        <div className="source-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Find a city, town, or county" placeholder="Find a city, town, or county" autoFocus />
        </div>
        <div className="meeting-picker-list">
          <a className="featured-meeting" href={asset("")}><MapPin size={18} /><span><strong>Cheyenne</strong><small>The full council record</small></span></a>
          {places.filter((place) => !(place.layer === "place" && place.id === "cheyenne")).map((place) => (
            <a key={`${place.layer}-${place.id}`} href={asset(place.href)}>
              <MapPin size={16} />
              <span><strong>{place.title}</strong><small>{place.layer === "county" ? "County government" : `${place.kind} · ${place.countyName}`}</small></span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
