"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import KnockSurvey from "@/app/components/KnockSurvey";
import ScheduleReminderSheet from "@/app/components/ScheduleReminderSheet";
import { supabase } from "@/lib/supabase/client";
import { buildColorMap, DEFAULT_DISPO_CONFIG, type DispositionConfig } from "@/lib/dispositionConfig";

/* ------------------------------------------------
   Types & constants
-------------------------------------------------*/

type Row = {
  idx: number;
  item_id: string;
  location_id: string | null;
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
  visited: boolean;
  last_result: string | null;
  last_result_at: string | null;
};

type PersonLite = { id: string; name: string };

/* ------------------------------------------------
   Helpers
-------------------------------------------------*/

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

/* ------------------------------------------------
   Page Component
-------------------------------------------------*/

export default function KnockStep() {
  const params = useParams<{ id: string; index: string }>();
  const router = useRouter();
  const sp = useSearchParams();

  const urlIndex = Math.max(0, parseInt(params.index || "0", 10) || 0);

  // Main data
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [result, setResult] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Residents (still loaded from Supabase client-side — future: move to API)
  const [people, setPeople] = useState<PersonLite[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);

  // Profile panel
  const [showProfile, setShowProfile] = useState(false);
  const [profileDetails, setProfileDetails] = useState<{
    phone?: string | null; phone_cell?: string | null; phone_landline?: string | null;
    email?: string | null; occupation_title?: string | null; company_name?: string | null;
    notes?: string | null; household_name?: string | null; mailing_address?: string | null;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Photo
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Disposition config (loaded from survey endpoint)
  const [dispoConfig, setDispoConfig] = useState<DispositionConfig>(DEFAULT_DISPO_CONFIG);

  // Survey / capture mode state
  const [callCaptureMode, setCallCaptureMode] = useState<string | null>(null);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);

  // Opportunity form (for callCaptureMode === 'opportunity')
  const [oppTitle, setOppTitle] = useState('');
  const [oppStage, setOppStage] = useState('');
  const [oppValue, setOppValue] = useState<number | ''>('');
  const [oppDue, setOppDue] = useState('');
  const [oppPriority, setOppPriority] = useState('');
  const [oppNotes, setOppNotes] = useState('');

  // Save status
  const [saving, setSaving] = useState(false);
  const [queued, setQueued] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Post-save reminder sheet
  const [showReminderSheet, setShowReminderSheet] = useState(false);
  const pendingNavRef = useRef<() => void>(() => {});

  // Correct Pin
  const [pinStatus, setPinStatus] = useState<null | "updating" | "done" | "error">(null);

  const resumeKey = `doors:cursor:${params.id}`;

  // Load rows — SQLite cache first, fall back to direct Supabase
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let data: Row[] = [];
      try {
        const res = await fetch(`/api/doors/${params.id}/locations`);
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) data = json;
      } catch {}

      if (data.length === 0) {
        const { data: rpc } = await supabase.rpc("gs_get_walklist_locations_v2", {
          _walklist_id: params.id,
        });
        if (Array.isArray(rpc)) data = rpc as Row[];
      }

      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params.id]);

  // Fetch survey_id, call_capture_mode, and dispositionConfig for this walklist (once)
  useEffect(() => {
    fetch(`/api/doors/${params.id}/survey`)
      .then((r) => r.json())
      .then((d) => {
        setSurveyId(d.survey_id ?? null);
        setCallCaptureMode(d.call_capture_mode ?? null);
        if (d.dispositionConfig) setDispoConfig(d.dispositionConfig);
      })
      .catch(() => {});
  }, [params.id]);

  // Lazy-fetch person details when profile tab is opened
  useEffect(() => {
    const personId = selectedPersonId ?? (rows && rows.length > 0 ? rows[clamp(urlIndex, 0, rows.length - 1)]?.primary_person_id : null);
    if (!showProfile || !personId || profileDetails) return;
    let cancelled = false;
    setProfileLoading(true);
    (async () => {
      try {
        const { data: pd } = await supabase
          .from('people')
          .select('phone, phone_cell, phone_landline, email, occupation_title, company_name, notes, household_id, mailing_address')
          .eq('id', personId)
          .maybeSingle();

        // Resolve household name (the address is already shown in the location card)
        let household_name: string | null = null;
        let hhId: string | null = pd?.household_id ?? null;
        if (!hhId) {
          const { data: ph } = await supabase
            .from('person_households')
            .select('household_id')
            .eq('person_id', personId)
            .limit(1)
            .maybeSingle();
          hhId = ph?.household_id ?? null;
        }
        if (hhId) {
          const { data: hh } = await supabase
            .from('households')
            .select('name')
            .eq('id', hhId)
            .maybeSingle();
          household_name = hh?.name ?? null;
        }

        if (!cancelled) setProfileDetails({ ...pd, household_name });
      } catch {
        if (!cancelled) setProfileDetails({});
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProfile, selectedPersonId]);

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

  // Persist resume index locally; reset survey state on each new house
  useEffect(() => {
    try {
      if (total > 0) localStorage.setItem(resumeKey, String(safeIndex));
    } catch {}
    setResult("");
    setNotes("");
    setShowSurvey(false);
    setSurveyDone(false);
    setShowProfile(false);
    setProfileDetails(null);
    setOppTitle('');
    setOppStage('');
    setOppValue('');
    setOppDue('');
    setOppPriority('');
    setOppNotes('');
    setPinStatus(null);
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

  // Resolve residents & household name (Supabase client-side fallback)
  useEffect(() => {
    if (!target) {
      setHouseholdName(null);
      setPeople([]);
      setSelectedPersonId(null);
      return;
    }

    // Use data already on the row
    setHouseholdName(target.household_name ?? null);
    if (target.primary_person_id && target.primary_person_name) {
      setPeople([{ id: target.primary_person_id, name: target.primary_person_name }]);
      setSelectedPersonId(target.primary_person_id);
    } else {
      setPeople([]);
      setSelectedPersonId(null);
    }
  }, [target]);

  // Upload photo to Supabase Storage (stays direct — not cached)
  async function maybeUploadPhoto(): Promise<string | null> {
    if (!photo) return null;
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const ext = (photo.type?.split("/")?.[1] || "jpg").toLowerCase();
      const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const storagePath = `door/${params.id}/${target?.item_id || "item"}/${name}`;
      const { error } = await sb.storage
        .from("door_photos")
        .upload(storagePath, photo, {
          cacheControl: "3600",
          upsert: true,
          contentType: photo.type || "image/jpeg",
        });
      if (error) return null;
      const { data } = sb.storage.from("door_photos").getPublicUrl(storagePath);
      return data?.publicUrl ?? null;
    } catch {
      return null;
    }
  }

  async function correctPin() {
    if (!target?.location_id) return;
    setPinStatus("updating");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      );
      const res = await fetch(`/api/crm/locations/${target.location_id}/coords`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      });
      if (!res.ok) throw new Error("Update failed");
      setPinStatus("done");
    } catch {
      setPinStatus("error");
    }
  }

  async function submitAndNext() {
    if (!target) return;
    setSaving(true);
    setSaveErr(null);
    setQueued(false);

    try {
      const photoUrl = await maybeUploadPhoto();
      const notesWithPhoto = photoUrl
        ? `${notes}\n\nPhoto: ${photoUrl}`.trim()
        : notes;

      const personId = selectedPersonId ?? target.primary_person_id ?? null;
      const personName = people.find((p) => p.id === personId)?.name ?? target.household_name ?? "Contact";
      const customOpp =
        callCaptureMode === "opportunity" && result === "contact_made"
          ? {
              title: oppTitle.trim() || `Follow-up: ${personName}`,
              stage: oppStage || "new",
              amount_cents: oppValue === '' ? null : Math.round(Number(oppValue) * 100),
              due_at: oppDue ? new Date(`${oppDue}T12:00:00`).toISOString() : null,
              priority: oppPriority || null,
              description: oppNotes.trim() || null,
            }
          : undefined;

      const res = await fetch("/api/doors/stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walklist_id: params.id,
          item_id: target.item_id,
          person_id: personId,
          result: result || "other",
          notes: notesWithPhoto || null,
          photo_url: photoUrl,
          idx: safeIndex,
          opportunity: customOpp,
        }),
      });

      const data = await res.json();
      if (data.queued) setQueued(true);

      // Offer reminder sheet before navigating
      const next = safeIndex + 1;
      const doNav = () => {
        if (rows && next < rows.length) {
          router.replace(`/doors/${params.id}/${next}`);
        } else {
          router.push(`/doors/${params.id}?view=${sp.get("view") ?? "list"}`);
        }
      };
      pendingNavRef.current = doNav;
      setShowReminderSheet(true);
    } catch (e: any) {
      setSaveErr(e?.message || "Save failed");
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

  const dispoItems = dispoConfig.doors.filter((d) => d.enabled);
  const colorMap = buildColorMap(dispoConfig);

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="info-title">Address</div>
              <div className="info-line strong">
                {target.address_line1 ?? "Unnamed location"}
              </div>
              {addr2 && <div className="info-line">{addr2}</div>}
            </div>
            {target.location_id && (
              <button
                type="button"
                onClick={correctPin}
                disabled={pinStatus === "updating"}
                title="Update this address's map pin to your current GPS position"
                style={{
                  background: "none",
                  border: "none",
                  cursor: pinStatus === "updating" ? "default" : "pointer",
                  padding: "2px 0",
                  fontSize: 11,
                  opacity: pinStatus === "done" ? 0.9 : 0.45,
                  color: pinStatus === "done" ? "#22c55e" : pinStatus === "error" ? "#f87171" : "inherit",
                  whiteSpace: "nowrap",
                  lineHeight: 1.3,
                  textAlign: "right",
                }}
              >
                {pinStatus === "updating"
                  ? "Updating…"
                  : pinStatus === "done"
                  ? "Pin updated ✓"
                  : pinStatus === "error"
                  ? "Update failed"
                  : "📍 Correct pin"}
              </button>
            )}
          </div>
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
                  onClick={() => { setSelectedPersonId(p.id); setProfileDetails(null); }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form / Profile tab strip — shown when a person is identified */}
        {(selectedPersonId ?? target.primary_person_id) && (
          <div style={{ display: 'flex', gap: 6, margin: '14px 0 4px' }}>
            <button
              type="button"
              onClick={() => setShowProfile(false)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: !showProfile ? 'rgba(96,165,250,.18)' : 'transparent',
                color: !showProfile ? '#60A5FA' : 'rgba(255,255,255,.5)',
                fontWeight: !showProfile ? 700 : 400, fontSize: 13,
              }}
            >
              📋 Form
            </button>
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: showProfile ? 'rgba(96,165,250,.18)' : 'transparent',
                color: showProfile ? '#60A5FA' : 'rgba(255,255,255,.5)',
                fontWeight: showProfile ? 700 : 400, fontSize: 13,
              }}
            >
              👤 Profile
            </button>
          </div>
        )}

        {/* Profile tab content */}
        {showProfile && (
          <div style={{ padding: '14px 0', display: 'grid', gap: 12, fontSize: 13 }}>
            {profileLoading && <p style={{ opacity: 0.5 }}>Loading…</p>}
            {!profileLoading && profileDetails && (() => {
              const d = profileDetails;
              const phones = [d.phone, d.phone_cell, d.phone_landline].filter(Boolean);
              const hasAny = d.household_name || d.mailing_address || phones.length ||
                d.email || d.occupation_title || d.company_name || d.notes;
              const row = (label: string, val: string) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: 2 }}>{label}</div>
                  <div style={{ lineHeight: 1.5 }}>{val}</div>
                </div>
              );
              return (
                <>
                  {!hasAny && <p style={{ opacity: 0.5 }}>No additional details on file.</p>}
                  {d.household_name && row('Household', d.household_name)}
                  {(d.occupation_title || d.company_name) && row('Role', [d.occupation_title, d.company_name].filter(Boolean).join(' · '))}
                  {phones.length > 0 && row('Phone', phones.join(' / '))}
                  {d.email && row('Email', d.email)}
                  {d.mailing_address && row('Mailing Address', d.mailing_address)}
                  {d.notes && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginBottom: 2 }}>Notes</div>
                      <div style={{ lineHeight: 1.6, opacity: 0.85, whiteSpace: 'pre-wrap' }}>{d.notes}</div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Result buttons — hidden while viewing profile */}
        {!showProfile && <>
        <div className="mt-6">
          <div className="block text-sm mb-2 opacity-80">Result</div>
          <div className="dispo-grid">
            {dispoItems.map(({ key, label }) => {
              const color = colorMap[key];
              const selected = result === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setResult(key);
                    if (key === "contact_made" && surveyId && callCaptureMode === 'survey') {
                      setShowSurvey(true);
                      setSurveyDone(false);
                    } else {
                      setShowSurvey(false);
                      setSurveyDone(false);
                    }
                  }}
                  className="press-card plain"
                  data-selected={selected}
                  aria-pressed={selected}
                  style={color ? {
                    borderColor: selected ? color : `${color}66`,
                    backgroundColor: selected ? `${color}33` : undefined,
                  } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Inline survey — shown when contact_made and a survey is linked */}
        {showSurvey && !surveyDone && surveyId && (
          <KnockSurvey
            surveyId={surveyId}
            contactId={target?.primary_person_id ?? `anon-${target?.item_id}`}
            onDone={() => { setShowSurvey(false); setSurveyDone(true); }}
          />
        )}

        {/* Opportunity form — shown when callCaptureMode=opportunity and contact was made */}
        {callCaptureMode === 'opportunity' && result === 'contact_made' && (
          <div className="mt-6" style={{ padding: '16px', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.03)', display: 'grid', gap: 12 }}>
            <div className="block text-sm" style={{ fontWeight: 600, opacity: 0.9 }}>Opportunity Details</div>

            <div className="field">
              <label className="block text-sm mb-1" style={{ opacity: 0.7 }}>Title</label>
              <input
                className="notes"
                style={{ minHeight: 'unset', padding: '8px 12px' }}
                value={oppTitle}
                onChange={(e) => setOppTitle(e.target.value)}
                placeholder={`Follow-up: ${people.find((p) => p.id === (selectedPersonId ?? target.primary_person_id))?.name ?? target.household_name ?? 'Contact'}`}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="field">
                <label className="block text-sm mb-1" style={{ opacity: 0.7 }}>Stage</label>
                <select className="notes" style={{ minHeight: 'unset', padding: '8px 10px', appearance: 'none' }} value={oppStage} onChange={(e) => setOppStage(e.target.value)}>
                  <option value="">Select…</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
              <div className="field">
                <label className="block text-sm mb-1" style={{ opacity: 0.7 }}>Priority</label>
                <select className="notes" style={{ minHeight: 'unset', padding: '8px 10px', appearance: 'none' }} value={oppPriority} onChange={(e) => setOppPriority(e.target.value)}>
                  <option value="">Select…</option>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="field">
                <label className="block text-sm mb-1" style={{ opacity: 0.7 }}>Value (USD)</label>
                <input
                  type="number"
                  min={0}
                  className="notes"
                  style={{ minHeight: 'unset', padding: '8px 10px' }}
                  placeholder="e.g. 250"
                  value={oppValue}
                  onChange={(e) => setOppValue(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label className="block text-sm mb-1" style={{ opacity: 0.7 }}>Follow-up date</label>
                <input
                  type="date"
                  className="notes"
                  style={{ minHeight: 'unset', padding: '8px 10px' }}
                  value={oppDue}
                  onChange={(e) => setOppDue(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label className="block text-sm mb-1" style={{ opacity: 0.7 }}>Opportunity notes</label>
              <textarea
                className="notes"
                rows={2}
                style={{ minHeight: 'unset' }}
                value={oppNotes}
                onChange={(e) => setOppNotes(e.target.value)}
                placeholder="Context, commitment, next steps…"
              />
            </div>
          </div>
        )}

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

        {/* Queued notice */}
        {queued && (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm mt-4">
            Saved locally — will sync when back online.
          </div>
        )}

        {/* Error */}
        {saveErr ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm mt-4">
            {saveErr}
          </div>
        ) : null}
        </>}

        {/* Actions — always visible */}
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
            disabled={!result || saving || (result === "contact_made" && !!surveyId && callCaptureMode === 'survey' && !surveyDone)}
            aria-disabled={!result || saving || (result === "contact_made" && !!surveyId && callCaptureMode === 'survey' && !surveyDone)}
          >
            {saving ? "Saving…" : "Save & Next"}
          </button>
        </div>
      </section>

      {showReminderSheet && (
        <ScheduleReminderSheet
          defaultType="return_visit"
          defaultTitle={`Return visit: ${target.address_line1 ?? "location"}`}
          personId={selectedPersonId ?? target.primary_person_id}
          householdId={target.household_id}
          walklistItemId={target.item_id}
          onDismiss={() => {
            setShowReminderSheet(false);
            pendingNavRef.current();
          }}
          onSaved={() => {
            setShowReminderSheet(false);
            pendingNavRef.current();
          }}
        />
      )}
    </main>
  );
}
