"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/* ------------------------------------------------
   Types & constants
-------------------------------------------------*/

type Row = {
  idx: number;
  item_id: string;
  location_id: string;
  lat: number | null;
  lng: number | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  household_id: string | null;
  household_name: string | null;
  primary_person_id: string | null;
  primary_person_name: string | null;
  geojson: string | null;
  visited: boolean;
  last_result: string | null;
  last_result_at: string | null;
};

type PersonLite = { id: string; name: string };

const DISPO = [
  { key: "not_home", label: "Not Home" },
  { key: "contact_made", label: "Contacted" },
  { key: "refused", label: "Refused" },
  { key: "wrong_address", label: "Wrong Address" },
  { key: "follow_up", label: "Follow Up" },
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s?: string | null) => !!s && UUID_RE.test(s);

/* ------------------------------------------------
   Helpers
-------------------------------------------------*/

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

function getTenantIdFromBrowser(): string {
  try {
    if (typeof window !== "undefined") {
      const ls =
        localStorage.getItem("tenantId") || localStorage.getItem("tenant_id");
      if (ls) return ls;
      const m1 = document.cookie.match(/(?:^|; )tenantId=([^;]+)/);
      if (m1?.[1]) return decodeURIComponent(m1[1]);
      const m2 = document.cookie.match(/(?:^|; )tenant_id=([^;]+)/);
      if (m2?.[1]) return decodeURIComponent(m2[1]);
    }
  } catch {}
  // Dev fallback (keeps writes consistent during local testing)
  return process.env.NEXT_PUBLIC_TEST_TENANT_ID ??
    "00000000-0000-0000-0000-000000000000";
}

// Map API list → real walklist (same idea as Dials)
async function resolveEffectiveWalklistId(id: string): Promise<string> {
  try {
    const quick = await supabase
      .from("walklist_items")
      .select("id", { head: true, count: "exact" })
      .eq("walklist_id", id);
    if (!quick.error && (quick.count ?? 0) > 0) return id;
  } catch {}

  for (const table of ["api_call_lists", "api_knock_lists", "api_lists"]) {
    try {
      const probe = await supabase
        .from(table)
        .select("*")
        .eq("id", id)
        .limit(1)
        .maybeSingle();
      const d = (probe as any)?.data;
      if (d) {
        for (const k of [
          "walklist_id",
          "list_id",
          "parent_walklist_id",
          "source_walklist_id",
        ]) {
          if (d[k]) return String(d[k]);
        }
      }
    } catch {}
  }
  return id;
}

/* ------------------------------------------------
   Page Component
-------------------------------------------------*/

export default function KnockStep() {
  const params = useParams<{ id: string; index: string }>();
  const router = useRouter();
  const sp = useSearchParams();

  const urlIndex = Math.max(0, parseInt(params.index || "0", 10) || 0);
  const [realWalklistId, setRealWalklistId] = useState<string | null>(null);

  // Main data
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [result, setResult] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Residents
  const [people, setPeople] = useState<PersonLite[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);

  // Photo
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Save status
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<
    | null
    | {
        where: string;
        code?: string;
        message?: string;
        details?: any;
        hint?: string;
        args?: any;
      }
  >(null);

  const tenantId = getTenantIdFromBrowser();
  const resumeKey = `doors:cursor:${tenantId}:${params.id}`;

  // Load rows
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setRows(null);

      const realId = await resolveEffectiveWalklistId(params.id);
      if (cancelled) return;
      setRealWalklistId(realId);

      const { data, error } = await supabase.rpc(
        "gs_get_walklist_locations_v2",
        { _walklist_id: realId }
      );
      if (!cancelled) {
        if (error) {
          console.error(error);
          setRows([]);
        } else {
          setRows((data ?? []) as Row[]);
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  // Compute safe index & target row
  const total = rows?.length ?? 0;
  const safeIndex = total > 0 ? clamp(urlIndex, 0, total - 1) : 0;
  const target = total > 0 ? rows![safeIndex] : null;

  // If index out of range but rows exist, redirect to safe one
  useEffect(() => {
    if (total > 0 && safeIndex !== urlIndex) {
      router.replace(`/doors/${params.id}/${safeIndex}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, urlIndex, safeIndex, params.id]);

  // Persist resume index locally
  useEffect(() => {
    try {
      if (total > 0) localStorage.setItem(resumeKey, String(safeIndex));
    } catch {}
  }, [resumeKey, safeIndex, total]);

  // Photo preview lifecycle
  useEffect(() => {
    if (!photo) {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  // Resolve residents & household name for the target
  useEffect(() => {
    (async () => {
      if (!target) {
        setHouseholdName(null);
        setPeople([]);
        setSelectedPersonId(null);
        return;
      }

      // household name (already on row; fallback by location if needed)
      if (target.household_name) {
        setHouseholdName(target.household_name);
      } else if (!target.household_name && target.household_id) {
        const { data: hh } = await supabase
          .from("households")
          .select("name")
          .eq("id", target.household_id)
          .limit(1)
          .maybeSingle();
        setHouseholdName(hh?.name ?? null);
      } else if (!target.household_id && target.location_id) {
        const { data: h2 } = await supabase
          .from("households")
          .select("id,name")
          .eq("location_id", target.location_id)
          .limit(1)
          .maybeSingle();
        setHouseholdName(h2?.name ?? null);
      }

      // resident candidates:
      // 1) explicit mapping table
      let candidates: PersonLite[] = [];
      if (target.item_id) {
        const { data: wip } = await supabase
          .from("walklist_item_people")
          .select("person_id")
          .eq("walklist_item_id", target.item_id);
        const ids = (wip ?? []).map((r: any) => r.person_id).filter(Boolean);

        if (ids.length > 0) {
          const { data: ppl } = await supabase
            .from("people")
            .select("id, first_name, last_name")
            .in("id", ids);
          candidates = (ppl ?? []).map((p: any) => ({
            id: p.id,
            name:
              [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
              "Unnamed",
          }));
        }
      }

      // 2) fallback: people in the household attached to this location
      if (candidates.length === 0 && target.location_id) {
        const { data: h } = await supabase
          .from("households")
          .select("id")
          .eq("location_id", target.location_id)
          .limit(1)
          .maybeSingle();
        const householdId = h?.id ?? target.household_id;

        if (householdId) {
          const { data: ppl2 } = await supabase
            .from("people")
            .select("id, first_name, last_name")
            .eq("household_id", householdId);
          candidates = (ppl2 ?? []).map((p: any) => ({
            id: p.id,
            name:
              [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
              "Unnamed",
          }));
        }
      }

      setPeople(candidates);
      setSelectedPersonId(
        target.primary_person_id || candidates[0]?.id || null
      );
    })();
  }, [target]);

  async function maybeUploadPhoto(): Promise<string | null> {
    if (!photo) return null;
    try {
      const ext = (photo.type?.split("/")?.[1] || "jpg").toLowerCase();
      const name = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;
      const path = `${tenantId || "tenant"}/${realWalklistId || params.id}/${
        target?.item_id || "item"
      }/${name}`;

      const { error } = await supabase.storage
        .from("door_photos")
        .upload(path, photo, {
          cacheControl: "3600",
          upsert: true,
          contentType: photo.type || "image/jpeg",
        });
      if (error) return null;

      const { data } = supabase.storage.from("door_photos").getPublicUrl(path);
      return data?.publicUrl ?? null;
    } catch {
      return null;
    }
  }

  async function submitAndNext() {
    if (!target) return;
    setSaving(true);
    setSaveErr(null);

    try {
      // Optional photo attachment
      const photoUrl = await maybeUploadPhoto();
      const notesWithPhoto = photoUrl
        ? `${notes}\n\nPhoto: ${photoUrl}`.trim()
        : notes;

      // 1) Create stop (v2; returns aliased stop_id)
      const { data: stopRows, error: stopErr } = await supabase.rpc(
        "gs_create_stop_v2",
        {
          _tenant_id: tenantId,
          _payload: {
            tenant_id: tenantId,
            walklist_id: realWalklistId ?? params.id,
            walklist_item_id: target.item_id,
            person_id: selectedPersonId ?? target.primary_person_id,
            user_id: null,
            channel: "door",
            result: result || "other",
            notes: notesWithPhoto || null,
            duration_sec: 0,
          },
        }
      );
      if (stopErr) throw { where: "create_stop", ...stopErr };

      const stopId =
        (Array.isArray(stopRows)
          ? stopRows[0]?.stop_id
          : (stopRows as any)?.stop_id) ||
        (Array.isArray(stopRows)
          ? stopRows[0]?.id
          : (stopRows as any)?.id);
      if (!isUuid(stopId))
        throw { where: "create_stop", message: "Invalid stop id" };

      // 2) Progress upsert
      const { error: progErr } = await supabase.rpc(
        "gs_update_walklist_progress_v1",
        {
          _tenant_id: tenantId,
          _walklist_id: realWalklistId ?? params.id,
          _walklist_item_id: target.item_id,
          _last_index: safeIndex,
          _mark_visited: true,
        }
      );
      if (progErr) throw { where: "update_progress", ...progErr };

      // 3) Create opportunity when it makes sense
      if (result === "contact_made" || result === "follow_up") {
        const { error: oppErr } = await supabase.rpc(
          "gs_create_opportunity_v2",
          {
            _tenant_id: tenantId,
            _payload: {
              stop_id: stopId,
              contact_person_id:
                selectedPersonId ?? target.primary_person_id ?? null,
              title:
                result === "follow_up" ? "Follow up from door" : "Door contact",
              stage: "new",
              amount_cents: null,
              due_at: null,
              priority: result === "follow_up" ? "high" : null,
              description: notesWithPhoto || null,
              source: "doors",
            },
          }
        );
        if (oppErr) throw { where: "create_opportunity", ...oppErr };
      }

      // 4) Navigate to next
      const next = safeIndex + 1;
      if (rows && next < rows.length) {
        router.replace(`/doors/${params.id}/${next}`);
      } else {
        router.push(`/doors/${params.id}?view=${sp.get("view") ?? "list"}`);
      }
    } catch (e: any) {
      setSaveErr({
        where: e?.where || "unknown",
        code: e?.code,
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        args: e?.args,
      });
    } finally {
      setSaving(false);
    }
  }

  function skipToNext() {
    const next = safeIndex + 1;
    if (rows && next < rows.length) {
      router.replace(`/doors/${params.id}/${next}`);
    } else {
      router.push(`/doors/${params.id}?view=${sp.get("view") ?? "list"}`);
    }
  }

  /* ------------------------------------------------
     Render
  -------------------------------------------------*/

  if (loading) {
    return (
      <main className="doors center-wrap px-4 py-6">
        <div className="rounded-2xl p-6 text-center opacity-70 border border-dashed">
          Loading…
        </div>
      </main>
    );
  }

  if (!target) {
    return (
      <main className="doors center-wrap px-4 py-6">
        <div className="rounded-2xl p-6 text-center opacity-70 border border-dashed">
          No location at this index.
        </div>
        <div className="mt-4 flex justify-center">
          <button
            className="press-card plain back-btn--sm"
            onClick={() => router.push(`/doors/${params.id}?view=list`)}
          >
            ← Back to list
          </button>
        </div>
      </main>
    );
  }

  const addr2 = [target.city, target.state, target.postal_code]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="doors center-wrap px-4 py-6">
      {/* Back to list/map */}
      <div className="flex justify-center">
        <button
          className="press-card plain back-btn--sm"
          onClick={() =>
            router.push(`/doors/${params.id}?view=${sp.get("view") ?? "list"}`)
          }
        >
          ← List/Map
        </button>
      </div>

      <section className="rounded-2xl p-5 shadow bg-[var(--card-bg)] mt-3">
        {/* Address & household */}
        <div className="press-card plain info-box">
          <div className="info-title">Address</div>
          <div className="info-line strong">
            {target.address_line1 ?? "Unnamed location"}
          </div>
          {addr2 && <div className="info-line">{addr2}</div>}
          {householdName && (
            <div className="info-line" style={{ marginTop: 6 }}>
              <strong>Household:&nbsp;</strong>
              {householdName}
            </div>
          )}
        </div>

        {/* Residents */}
        {people.length > 0 && (
          <div className="card plain info-box" style={{ marginTop: 12 }}>
            <div className="info-title">Residents</div>
            <div className="chips" role="radiogroup" aria-label="Select person">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedPersonId === p.id}
                  className="chip"
                  data-selected={selectedPersonId === p.id}
                  onClick={() => setSelectedPersonId(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Result buttons */}
        <div className="mt-6">
          <div className="block text-sm mb-2 opacity-80">Result</div>
          <div className="dispo-grid">
            {DISPO.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setResult(key)}
                className="press-card plain"
                data-selected={result === key}
                aria-pressed={result === key}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Photo */}
        <div className="mt-6 grid gap-2">
          <div className="block text-sm opacity-80">Add a picture</div>

          {photoPreview ? (
            <div className="flex items-center justify-center gap-3">
              <img
                src={photoPreview}
                alt="Selected"
                className="rounded-xl border"
                style={{ width: 120, height: 120, objectFit: "cover" }}
              />
              <div className="flex gap-2">
                <button
                  className="press-card plain"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Replace
                </button>
                <button
                  className="press-card plain"
                  onClick={() => {
                    setPhoto(null);
                    if (photoPreview) URL.revokeObjectURL(photoPreview);
                    setPhotoPreview(null);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              className="press-card plain"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload or Take Picture
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setPhoto(f || null);
            }}
          />
        </div>

        {/* Notes */}
        <div className="mt-6 field">
          <label className="block text-sm mb-1 opacity-80">Notes</label>
          <textarea
            className="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="Gate code, dogs, preferences, etc."
          />
        </div>

        {/* Error */}
        {saveErr ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm mt-4">
            <div className="font-semibold mb-1">
              Save failed ({saveErr.where})
            </div>
            <div>{saveErr.message || "Unknown error"}</div>
          </div>
        ) : null}

        {/* Actions */}
        <div className="actions mt-7">
          <button
            type="button"
            className="press-card plain action-skip"
            onClick={skipToNext}
          >
            Skip
          </button>
          <button
            type="button"
            className="btn action-submit"
            onClick={submitAndNext}
            disabled={!result || saving}
            aria-disabled={!result || saving}
          >
            {saving ? "Saving…" : "Save & Next"}
          </button>
        </div>
      </section>
    </main>
  );
}
