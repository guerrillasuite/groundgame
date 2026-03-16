/**
 * One-time migration: copy all data from local surveys.db → Supabase
 *
 * Run after the Supabase tables are created:
 *   npx tsx scripts/migrate-surveys.ts
 */

import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";

// Load .env.local manually — strip BOM, handle quoted values
const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  const raw = fs.readFileSync(envFile, "utf-8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) process.env[key] = val;
  }
}

const DB_PATH = path.join(process.cwd(), "data", "surveys.db");

async function migrate() {
  const TENANT_ID = process.env.NEXT_PUBLIC_TEST_TENANT_ID ?? "00000000-0000-0000-0000-000000000000";
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const db = new Database(DB_PATH, { readonly: true });
  try {
    // ── Surveys ──────────────────────────────────────────────────────────────
    const surveys = db.prepare("SELECT * FROM surveys").all() as any[];
    console.log(`Migrating ${surveys.length} surveys…`);

    for (const s of surveys) {
      const { error } = await sb.from("surveys").upsert({
        id: s.id,
        tenant_id: TENANT_ID,
        title: s.title,
        description: s.description ?? null,
        active: Boolean(s.active),
        created_at: s.created_at,
        updated_at: s.updated_at ?? s.created_at,
      });
      if (error) console.error(`  Survey ${s.id}: ${error.message}`);
      else console.log(`  ✓ survey: ${s.id}`);
    }

    // ── Questions ─────────────────────────────────────────────────────────────
    const questions = db.prepare("SELECT * FROM questions").all() as any[];
    console.log(`\nMigrating ${questions.length} questions…`);

    for (const q of questions) {
      const options = q.options ? JSON.parse(q.options) : null;
      const { error } = await sb.from("questions").upsert({
        id: q.id,
        survey_id: q.survey_id,
        question_text: q.question_text,
        question_type: q.question_type,
        options,
        required: Boolean(q.required),
        order_index: q.order_index,
        created_at: q.created_at,
      });
      if (error) console.error(`  Question ${q.id}: ${error.message}`);
      else console.log(`  ✓ question: ${q.id}`);
    }

    // ── Responses ─────────────────────────────────────────────────────────────
    const responses = db.prepare("SELECT * FROM responses").all() as any[];
    console.log(`\nMigrating ${responses.length} responses…`);

    // Insert in batches of 100
    for (let i = 0; i < responses.length; i += 100) {
      const batch = responses.slice(i, i + 100).map((r: any) => ({
        crm_contact_id: r.crm_contact_id,
        survey_id: r.survey_id,
        question_id: r.question_id,
        answer_value: r.answer_value,
        answer_text: r.answer_text ?? null,
        original_position: r.original_position ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at ?? r.created_at,
      }));
      const { error } = await sb.from("responses").insert(batch);
      if (error) console.error(`  Responses batch ${i}: ${error.message}`);
      else console.log(`  ✓ responses ${i + 1}–${i + batch.length}`);
    }

    // ── Survey sessions ───────────────────────────────────────────────────────
    const sessions = db.prepare("SELECT * FROM survey_sessions").all() as any[];
    console.log(`\nMigrating ${sessions.length} survey sessions…`);

    for (const s of sessions) {
      const { error } = await sb.from("survey_sessions").upsert({
        crm_contact_id: s.crm_contact_id,
        survey_id: s.survey_id,
        started_at: s.started_at,
        completed_at: s.completed_at ?? null,
        last_question_answered: s.last_question_answered ?? null,
      }, { onConflict: "crm_contact_id,survey_id" });
      if (error) console.error(`  Session ${s.crm_contact_id}/${s.survey_id}: ${error.message}`);
    }
    console.log(`  ✓ sessions done`);

    console.log("\nMigration complete!");
    console.log("You can now safely stop using surveys.db.");
  } finally {
    db.close();
  }
}

migrate().catch(console.error);
