"use client";

import { useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { PlacePicker } from "@/components/place-picker";

export function PlacePickerButton({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="city-select" type="button" onClick={() => setOpen(true)}><MapPin size={16} /><span>{label}</span><ChevronDown size={13} /></button>
      {open && <PlacePicker onClose={() => setOpen(false)} />}
    </>
  );
}
