"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { TagPill } from "./TagPill";

interface Tag {
  id: string;
  name: string;
}

interface TagPickerProps {
  personId: string;
  currentTagIds: string[];
  allTags: Tag[];
  onTagsChange?: (tagIds: string[]) => void;
}

export function TagPicker({ personId, currentTagIds, allTags, onTagsChange }: TagPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [localTagIds, setLocalTagIds] = useState<string[]>(currentTagIds);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocalTagIds(currentTagIds); }, [currentTagIds]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = allTags.filter(
    (t) => !localTagIds.includes(t.id) && t.name.toLowerCase().includes(query.toLowerCase())
  );

  async function addTag(tag: Tag) {
    const next = [...localTagIds, tag.id];
    setLocalTagIds(next);
    setQuery("");
    inputRef.current?.focus();
    startTransition(async () => {
      await fetch(`/api/crm/people/${personId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add: [tag.id] }),
      });
      onTagsChange?.(next);
    });
  }

  async function removeTag(tagId: string) {
    const next = localTagIds.filter((id) => id !== tagId);
    setLocalTagIds(next);
    startTransition(async () => {
      await fetch(`/api/crm/people/${personId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remove: [tagId] }),
      });
      onTagsChange?.(next);
    });
  }

  const appliedTags = allTags.filter((t) => localTagIds.includes(t.id));

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          alignItems: "center",
          minHeight: "36px",
          padding: "4px 8px",
          border: "1px solid #d1d5db",
          borderRadius: "6px",
          background: "#fff",
          cursor: "text",
        }}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {appliedTags.map((t) => (
          <TagPill key={t.id} name={t.name} onRemove={() => removeTag(t.id)} disabled={isPending} />
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={appliedTags.length === 0 ? "Add tags…" : ""}
          style={{
            border: "none",
            outline: "none",
            fontSize: "0.875rem",
            flex: 1,
            minWidth: "80px",
            background: "transparent",
          }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            maxHeight: "200px",
            overflowY: "auto",
          }}
        >
          {filtered.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(tag); }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: "0.875rem",
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && query.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            padding: "8px 12px",
            fontSize: "0.875rem",
            color: "#9ca3af",
          }}
        >
          No tags match "{query}"
        </div>
      )}
    </div>
  );
}
