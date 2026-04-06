"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapPoint } from "@/app/crm/lists/map-builder/MapBuilderPanel";

type Mode = "pan" | "select" | "deselect";

type Props = {
  locations: MapPoint[];
  selectedIds: Set<string>;
  savedIds?: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
};

export default function LocationMapSelector({ locations, selectedIds, savedIds = new Set(), onSelectionChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("pan");

  // Rectangle drag state
  const dragging = useRef(false);
  const startPx = useRef<[number, number]>([0, 0]);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [-98, 38],
      zoom: 4,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("locs", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Amber glow for selected pins
      map.addLayer({
        id: "locs-glow",
        type: "circle",
        source: "locs",
        filter: ["==", ["get", "sel"], 1],
        paint: {
          "circle-radius": 18,
          "circle-color": "#f59e0b",
          "circle-opacity": 0.25,
          "circle-stroke-width": 0,
        },
      });

      // Main dot layer: amber = selected, grey = saved, blue = default
      map.addLayer({
        id: "locs-dots",
        type: "circle",
        source: "locs",
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "case",
            ["==", ["get", "sel"],   1], "#f59e0b",
            ["==", ["get", "saved"], 1], "#9ca3af",
            "#2563eb"
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": [
            "case",
            ["==", ["get", "sel"],   1], "#d97706",
            ["==", ["get", "saved"], 1], "#6b7280",
            "#1d4ed8"
          ],
          "circle-opacity": ["case", ["==", ["get", "saved"], 1], 0.5, 1],
        },
      });

      // Click individual pin: toggle select/deselect based on current mode
      map.on("click", "locs-dots", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (!id) return;
        const currentMode = modeRef.current;
        const next = new Set(selectedIdsRef.current);
        if (currentMode === "deselect") {
          next.delete(id);
        } else {
          // pan or select: toggle
          next.has(id) ? next.delete(id) : next.add(id);
        }
        onSelectionChange(next);
      });

      map.on("mouseenter", "locs-dots", () => {
        map.getCanvas().style.cursor = modeRef.current !== "pan" ? "crosshair" : "pointer";
      });
      map.on("mouseleave", "locs-dots", () => {
        map.getCanvas().style.cursor = modeRef.current !== "pan" ? "crosshair" : "";
      });

      mapRef.current = map;
      setReady(true);
    });

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs to avoid stale closures in event handlers
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // ── Update GeoJSON source ─────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const source = mapRef.current.getSource("locs") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: locations.map((l) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [l.lon, l.lat] },
        properties: {
          id: l.id,
          sel:   selectedIds.has(l.id) ? 1 : 0,
          saved: savedIds.has(l.id)    ? 1 : 0,
          address: l.address ?? "",
        },
      })),
    });
  }, [ready, locations, selectedIds, savedIds]);

  // ── Fit bounds when locations change ──────────────────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current || locations.length === 0) return;
    if (locations.length === 1) {
      mapRef.current.flyTo({ center: [locations[0].lon, locations[0].lat], zoom: 14 });
      return;
    }
    const lons = locations.map((l) => l.lon);
    const lats = locations.map((l) => l.lat);
    mapRef.current.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 60, maxZoom: 16, duration: 600 }
    );
  }, [ready, locations]);

  // ── Disable/enable dragPan based on mode ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (mode !== "pan") {
      map.dragPan.disable();
      map.getCanvas().style.cursor = "crosshair";
    } else {
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    }
  }, [ready, mode]);

  // ── Rectangle drag handlers ───────────────────────────────────────────────
  function getRelativeXY(e: React.MouseEvent): [number, number] {
    const r = containerRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (mode === "pan" || e.button !== 0) return;
    e.preventDefault();
    const xy = getRelativeXY(e);
    startPx.current = xy;
    dragging.current = true;
    setRect({ left: xy[0], top: xy[1], width: 0, height: 0 });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    const [x, y] = getRelativeXY(e);
    const [sx, sy] = startPx.current;
    setRect({ left: Math.min(sx, x), top: Math.min(sy, y), width: Math.abs(x - sx), height: Math.abs(y - sy) });
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (!dragging.current) return;
    dragging.current = false;
    setRect(null);

    const map = mapRef.current;
    if (!map) return;

    const [ex, ey] = getRelativeXY(e);
    const [sx, sy] = startPx.current;
    const minX = Math.min(sx, ex), minY = Math.min(sy, ey);
    const maxX = Math.max(sx, ex), maxY = Math.max(sy, ey);

    if (maxX - minX < 3 && maxY - minY < 3) return;

    const feats = map.queryRenderedFeatures([[minX, minY], [maxX, maxY]], { layers: ["locs-dots"] });
    const next = new Set(selectedIdsRef.current);
    const isDeselect = modeRef.current === "deselect";
    for (const f of feats) {
      const id = f.properties?.id;
      if (!id) continue;
      isDeselect ? next.delete(id) : next.add(id);
    }
    onSelectionChange(next);
  }

  // Rect border/bg color by mode
  const rectColor = mode === "deselect" ? "#dc2626" : "#f59e0b";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Mode toggle */}
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 10,
        display: "flex", borderRadius: 8, overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}>
        {(["pan", "select", "deselect"] as Mode[]).map((m) => {
          const active = mode === m;
          const bg = active
            ? m === "pan"      ? "#2563eb"
            : m === "select"   ? "#f59e0b"
            :                    "#dc2626"
            : "white";
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "7px 14px", fontWeight: 600, fontSize: 13,
                border: "none", cursor: "pointer",
                background: bg,
                color: active ? "white" : "#374151",
                textTransform: "capitalize",
              }}
            >
              {m}
            </button>
          );
        })}
      </div>

      {mode !== "pan" && (
        <div style={{
          position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10,
          background: mode === "select" ? "rgba(245,158,11,0.9)" : "rgba(220,38,38,0.85)",
          color: "white", borderRadius: 20,
          padding: "5px 14px", fontSize: 12, fontWeight: 600, pointerEvents: "none",
        }}>
          {mode === "select" ? "Click or drag to select" : "Click or drag to deselect"}
        </div>
      )}

      {/* Map */}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", cursor: mode !== "pan" ? "crosshair" : undefined }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { dragging.current = false; setRect(null); }}
      />

      {/* Drag rectangle */}
      {rect && (
        <div style={{
          position: "absolute",
          left: rect.left, top: rect.top, width: rect.width, height: rect.height,
          border: `2px dashed ${rectColor}`,
          background: mode === "deselect" ? "rgba(220,38,38,0.08)" : "rgba(245,158,11,0.08)",
          pointerEvents: "none", zIndex: 20,
        }} />
      )}
    </div>
  );
}
