"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Pin = { idx?: number; id?: string; lat: number; lng: number; label?: string; visited?: boolean };

export default function KnockMap(props: {
  // support both legacy and new prop names
  pins?: Array<{ idx: number; lat: number; lng: number }>;
  onGo?: (idx: number) => void;

  points?: Array<{ id: string; lat: number; lng: number; label?: string; visited?: boolean }>;
  onMarkerClick?: (id: string) => void;
}) {
  const { pins, onGo, points, onMarkerClick } = props;
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const map = new maplibregl.Map({
      container: ref.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [-96.9, 32.8],
      zoom: 3,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showZoom: true }), "top-right");

    // normalize inputs → a single array of markers
    const raw = Array.isArray(points)
      ? points.map<Pin>((p) => ({ id: p.id, lat: Number(p.lat), lng: Number(p.lng), label: p.label, visited: p.visited }))
      : Array.isArray(pins)
      ? pins.map<Pin>((p) => ({ idx: p.idx, lat: Number(p.lat), lng: Number(p.lng) }))
      : [];

    // keep only finite coords and ignore (0,0)
    const valid = raw.filter(
      (p) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && !(p.lat === 0 && p.lng === 0)
    );

    if (valid.length) {
      const b = new maplibregl.LngLatBounds(
        [valid[0].lng, valid[0].lat],
        [valid[0].lng, valid[0].lat]
      );
      valid.forEach((p) => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: 40, maxZoom: 16 });
    }

    valid.forEach((p) => {
      const el = document.createElement("button");
      el.className = "rounded-full shadow text-xs px-2 py-1 bg-white";
      const label =
        typeof p.label === "string"
          ? p.label
          : Number.isFinite(p.idx!)
          ? String((p.idx as number) + 1)
          : "•";
      el.textContent = label;

      el.onclick = () => {
        if (onMarkerClick && typeof p.id === "string") onMarkerClick(p.id);
        else if (onGo && Number.isFinite(p.idx as number)) onGo(p.idx as number);
      };

      new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
    });

    return () => map.remove();
  }, [pins, points, onGo, onMarkerClick]);

  return <div ref={ref} className="h-[60vh] w-full" />;
}
