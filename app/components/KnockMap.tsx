"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Pin = { idx?: number; id?: string; lat: number; lng: number; label?: string; visited?: boolean; result?: string };

/** Map a knock result string → fill color for the house icon */
function markerColor(result: string | null | undefined, visited: boolean): string {
  if (!visited) return "#2563EB";           // blue  = not yet contacted
  if (!result)  return "#6B7280";           // gray  = visited, no result logged
  const r = result.toLowerCase();
  if (r.includes("strong support") || r === "1") return "#16A34A";   // deep green
  if (r.includes("support") || r === "2" || r.includes("warm"))      return "#22c55e";   // green
  if (r.includes("undecided") || r === "3")                           return "#F59E0B";   // gold
  if (r.includes("lean oppose") || r === "4")                         return "#F97316";   // orange
  if (r.includes("oppose") || r === "5" || r.includes("cold"))        return "#DC2626";   // red
  if (r.includes("not home") || r.includes("no answer"))              return "#9CA3AF";   // light gray
  return "#6B7280";
}

function makeHouseSvg(fill: string): SVGSVGElement {
  // 32×28px canvas, viewBox 0 0 24 21
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "32");
  svg.setAttribute("height", "28");
  svg.setAttribute("viewBox", "0 0 24 21");
  svg.setAttribute("aria-hidden", "true");

  // Roof — triangle
  const roof = document.createElementNS(NS, "polygon");
  roof.setAttribute("points", "12,1 1,10 23,10");
  roof.setAttribute("fill", fill);
  roof.setAttribute("stroke", "#fff");
  roof.setAttribute("stroke-width", "1.5");
  roof.setAttribute("stroke-linejoin", "round");
  svg.appendChild(roof);

  // Walls — rectangle (overlaps roof base by 1px so no gap)
  const body = document.createElementNS(NS, "rect");
  body.setAttribute("x", "3");
  body.setAttribute("y", "9");
  body.setAttribute("width", "18");
  body.setAttribute("height", "11");
  body.setAttribute("fill", fill);
  body.setAttribute("stroke", "#fff");
  body.setAttribute("stroke-width", "1.5");
  svg.appendChild(body);

  // Door — dark semi-transparent rect
  const door = document.createElementNS(NS, "rect");
  door.setAttribute("x", "9");
  door.setAttribute("y", "13");
  door.setAttribute("width", "6");
  door.setAttribute("height", "7");
  door.setAttribute("fill", "rgba(0,0,0,0.3)");
  svg.appendChild(door);

  return svg;
}

export default function KnockMap(props: {
  // support both legacy and new prop names
  pins?: Array<{ idx: number; lat: number; lng: number }>;
  onGo?: (idx: number) => void;

  points?: Array<{ id: string; lat: number; lng: number; label?: string; visited?: boolean; result?: string }>;
  onMarkerClick?: (id: string) => void;
}) {
  const { pins, onGo, points, onMarkerClick } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    setStatus("loading");

    const tileStyle =
      process.env.NEXT_PUBLIC_MAP_STYLE ||
      "https://tiles.openfreemap.org/styles/liberty";

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: tileStyle,
        center: [-96.9, 32.8],
        zoom: 3,
        attributionControl: true,
      });
    } catch (e: any) {
      setStatus("error");
      setErrMsg(e?.message || "MapLibre failed to initialize");
      return;
    }

    map.on("error", (e) => {
      console.error("[KnockMap] map error:", e);
      setStatus("error");
      setErrMsg(e.error?.message || "Map tile error");
    });

    map.addControl(new maplibregl.NavigationControl({ showZoom: true }), "top-right");

    // normalize inputs → a single array of markers
    const raw = Array.isArray(points)
      ? points.map<Pin>((p) => ({ id: p.id, lat: Number(p.lat), lng: Number(p.lng), label: p.label, visited: p.visited, result: p.result }))
      : Array.isArray(pins)
      ? pins.map<Pin>((p) => ({ idx: p.idx, lat: Number(p.lat), lng: Number(p.lng) }))
      : [];

    // keep only finite coords and ignore (0,0)
    const valid = raw.filter(
      (p) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && !(p.lat === 0 && p.lng === 0)
    );

    // Wait for style to load before adding markers and fitting bounds
    map.on("load", () => {
      setStatus("ready");
      // Resize in case container had 0 dimensions initially
      map.resize();

      if (valid.length) {
        const b = new maplibregl.LngLatBounds(
          [valid[0].lng, valid[0].lat],
          [valid[0].lng, valid[0].lat]
        );
        valid.forEach((p) => b.extend([p.lng, p.lat]));
        map.fitBounds(b, { padding: 40, maxZoom: 16 });
      }

      valid.forEach((p) => {
        const color = markerColor(p.result, p.visited ?? false);
        const tooltip =
          typeof p.label === "string" ? p.label
          : Number.isFinite(p.idx!) ? String((p.idx as number) + 1)
          : "";

        const el = document.createElement("button");
        el.setAttribute("style", "background:none;border:none;cursor:pointer;padding:0;display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6));");
        el.title = tooltip;
        el.setAttribute("aria-label", tooltip || "location");
        el.appendChild(makeHouseSvg(color));

        el.onclick = () => {
          if (onMarkerClick && typeof p.id === "string") onMarkerClick(p.id);
          else if (onGo && Number.isFinite(p.idx as number)) onGo(p.idx as number);
        };

        new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
      });
    });

    return () => map.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, points, onGo, onMarkerClick]);

  return (
    <div style={{ position: "relative", height: "60vh", width: "100%", minHeight: 300 }}>
      <div ref={ref} style={{ height: "100%", width: "100%" }} />
      {status === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 14 }}>
          Loading map…
        </div>
      )}
      {status === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", color: "#f87171", fontSize: 13, padding: 16, textAlign: "center" }}>
          Map error: {errMsg}
        </div>
      )}
    </div>
  );
}
