"""
Intel Brief — hourly news ingestion pipeline.

Phase 0: Fetch RSS feeds → extract full text with trafilatura
Phase 1: Rule-based keyword scoring (+ recency modifier)
Phase 2: Claude Haiku AI scoring (only if rule_score >= 7)
Final:   final_score = rule_score * 0.4 + ai_score * 0.6
         Writes to news_articles + tenant_article_relevance

Required env vars:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  ANTHROPIC_API_KEY
"""

import os
import re
import json
import time
import math
import hashlib
import datetime
from urllib.parse import quote_plus

import feedparser
import trafilatura
import anthropic
from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANTHROPIC_KEY = os.environ["ANTHROPIC_API_KEY"]

AI_SCORE_THRESHOLD = 7.0      # rule_score >= this → run Haiku
MAX_ARTICLES_PER_FEED = 30    # cap per feed per run
BACKFILL_LIMIT = 500          # unscored articles to backfill per tenant per run
RECENCY_BONUS_CAP = 1.5       # max recency bonus added to rule_score
FETCH_TIMEOUT = 15            # seconds for trafilatura fetch

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
ai = anthropic.Anthropic(api_key=ANTHROPIC_KEY)


# ── Helpers ───────────────────────────────────────────────────────────────────

def source_domain(url: str) -> str:
    m = re.match(r"https?://(?:www\.)?([^/]+)", url)
    return m.group(1) if m else url[:60]


def recency_bonus(published_at_iso: str | None) -> float:
    if not published_at_iso:
        return 0.0
    try:
        pub = datetime.datetime.fromisoformat(published_at_iso.replace("Z", "+00:00"))
        now = datetime.datetime.now(datetime.timezone.utc)
        hours_old = (now - pub).total_seconds() / 3600
        if hours_old < 2:
            return RECENCY_BONUS_CAP
        if hours_old < 6:
            return round(RECENCY_BONUS_CAP * 0.7, 2)
        if hours_old < 24:
            return round(RECENCY_BONUS_CAP * 0.3, 2)
        return 0.0
    except Exception:
        return 0.0


def rule_score(text: str, keywords: list[str]) -> float:
    """Score 0–10 based on keyword hit density."""
    if not keywords or not text:
        return 0.0
    text_lower = text.lower()
    hits = 0
    for kw in keywords:
        # multi-word phrases count more
        pattern = re.escape(kw.lower())
        matches = len(re.findall(pattern, text_lower))
        weight = min(len(kw.split()), 3)
        hits += matches * weight
    # Normalise: 1 hit → ~1.5, 5 hits → ~5, 15+ → 10
    score = min(10.0, math.log1p(hits) * 3.2)
    return round(score, 1)


def ai_score(title: str, snippet: str, keywords: list[str], categories: list[str]) -> float:
    """Ask Claude Haiku for a relevance score 0–10."""
    kw_str = ", ".join(keywords[:20])
    cat_str = ", ".join(categories[:10]) if categories else "general"
    prompt = (
        f"You are a relevance scoring assistant for a political/news intelligence tool.\n"
        f"Rate the relevance of the following article to this organization's interests.\n\n"
        f"Tracked keywords: {kw_str}\n"
        f"Categories of interest: {cat_str}\n\n"
        f"Article title: {title}\n"
        f"Article excerpt: {snippet[:800]}\n\n"
        f"Respond with ONLY a single number from 0.0 to 10.0 representing relevance. "
        f"10 = extremely relevant, 0 = completely irrelevant."
    )
    try:
        msg = ai.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=10,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        return round(min(10.0, max(0.0, float(raw))), 1)
    except Exception as e:
        print(f"    [AI score error] {e}")
        return 0.0


def final_score(rs: float, ai_s: float | None) -> float:
    if ai_s is None:
        return round(rs, 1)
    return round(rs * 0.4 + ai_s * 0.6, 1)


def fetch_full_text(url: str) -> str | None:
    try:
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            return None
        return trafilatura.extract(downloaded, include_comments=False, include_tables=False)
    except Exception:
        return None


def parse_feed(feed_url: str) -> list[dict]:
    try:
        feed = feedparser.parse(feed_url)
        articles = []
        for entry in feed.entries[:MAX_ARTICLES_PER_FEED]:
            url = entry.get("link", "")
            if not url:
                continue
            title = entry.get("title", "")
            snippet = entry.get("summary", "") or entry.get("description", "")
            # Strip HTML from snippet
            snippet = re.sub(r"<[^>]+>", "", snippet).strip()[:500]
            # Parse published date
            pub = None
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                try:
                    pub = datetime.datetime(*entry.published_parsed[:6], tzinfo=datetime.timezone.utc).isoformat()
                except Exception:
                    pass
            articles.append({
                "url": url,
                "title": title,
                "snippet": snippet,
                "published_at": pub,
                "source_domain": source_domain(url),
            })
        return articles
    except Exception as e:
        print(f"  [feed parse error] {feed_url}: {e}")
        return []


# ── Main pipeline ─────────────────────────────────────────────────────────────

def ingest_for_tenant(tenant_id: str, keywords: list[str], categories: list[str], blacklist: list[str], feeds: list[dict]):
    cat_keys = [c["key"] if isinstance(c, dict) else c for c in categories]
    blacklist_set = set(d.lower() for d in blacklist)
    print(f"\n  Tenant {tenant_id[:8]}… ({len(keywords)} keywords, {len(feeds)} feeds)")

    for feed in feeds:
        feed_id = feed["id"]
        feed_url = feed["feed_url"]
        print(f"  → Feed: {feed['name']} ({feed_url[:60]}…)")

        entries = parse_feed(feed_url)
        print(f"     {len(entries)} entries from feed")

        for entry in entries:
            url = entry["url"]
            dom = entry["source_domain"].lower()
            if any(bl in dom for bl in blacklist_set):
                continue

            # Upsert news_articles (global, no tenant)
            existing_res = sb.from_("news_articles").select("id, full_text").eq("url", url).limit(1).execute()
            article_id = None
            full_text = None

            if existing_res.data:
                article_id = existing_res.data[0]["id"]
                full_text = existing_res.data[0].get("full_text")
            else:
                # Phase 0: fetch full text
                full_text = fetch_full_text(url)
                ins = sb.from_("news_articles").insert({
                    "feed_id": feed_id,
                    "url": url,
                    "title": entry["title"],
                    "source_domain": entry["source_domain"],
                    "published_at": entry["published_at"],
                    "snippet": entry["snippet"],
                    "full_text": full_text,
                    "categories": [],
                }).execute()
                if ins.data:
                    article_id = ins.data[0]["id"]
                else:
                    print(f"     [skip] insert failed for {url[:60]}")
                    continue

            if not article_id:
                continue

            # Check if this tenant already has a score for this article
            existing_rel = sb.from_("tenant_article_relevance") \
                .select("id") \
                .eq("tenant_id", tenant_id) \
                .eq("article_id", article_id) \
                .limit(1) \
                .execute()
            if existing_rel.data:
                continue  # already scored for this tenant

            # Phase 1: rule-based score
            search_text = f"{entry['title']} {entry['snippet']} {full_text or ''}"
            rs = rule_score(search_text, keywords)
            bonus = recency_bonus(entry["published_at"])
            rs_with_bonus = min(10.0, round(rs + bonus, 1))

            # Phase 2: AI score (only if rule_score high enough)
            ai_s = None
            if rs_with_bonus >= AI_SCORE_THRESHOLD:
                ai_s = ai_score(entry["title"], entry["snippet"] or full_text or "", keywords, cat_keys)
                time.sleep(0.2)  # gentle rate limiting

            fs = final_score(rs_with_bonus, ai_s)

            sb.from_("tenant_article_relevance").upsert({
                "tenant_id": tenant_id,
                "article_id": article_id,
                "rule_score": rs_with_bonus,
                "ai_relevance_score": ai_s,
                "final_score": fs,
                "scored_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }, on_conflict="tenant_id,article_id").execute()

            mark = "🟢" if fs >= 8.5 else "🟡" if fs >= 7.0 else "⚪"
            print(f"     {mark} {entry['title'][:60]:60s} rule={rs_with_bonus} ai={ai_s} final={fs}")


def backfill_unscored_articles(tenant_id: str, keywords: list[str], categories: list[str], blacklist: list[str]):
    """Score articles that exist in news_articles but haven't been scored for this tenant yet."""
    cat_keys = [c["key"] if isinstance(c, dict) else c for c in categories]
    blacklist_set = set(d.lower() for d in blacklist)

    # Find articles not yet scored for this tenant (limit to recent ones)
    scored_ids_res = sb.from_("tenant_article_relevance") \
        .select("article_id") \
        .eq("tenant_id", tenant_id) \
        .execute()
    scored_ids = {r["article_id"] for r in (scored_ids_res.data or [])}

    all_articles_res = sb.from_("news_articles") \
        .select("id, url, title, snippet, full_text, source_domain, published_at") \
        .order("fetched_at", desc=True) \
        .limit(BACKFILL_LIMIT + len(scored_ids)) \
        .execute()

    unscored = [a for a in (all_articles_res.data or []) if a["id"] not in scored_ids][:BACKFILL_LIMIT]
    if not unscored:
        return

    print(f"  Backfilling {len(unscored)} articles for tenant {tenant_id[:8]}…")
    for article in unscored:
        dom = (article.get("source_domain") or "").lower()
        if any(bl in dom for bl in blacklist_set):
            continue

        search_text = f"{article['title']} {article['snippet'] or ''} {article['full_text'] or ''}"
        rs = rule_score(search_text, keywords)
        bonus = recency_bonus(article["published_at"])
        rs_with_bonus = min(10.0, round(rs + bonus, 1))

        ai_s = None
        if rs_with_bonus >= AI_SCORE_THRESHOLD:
            ai_s = ai_score(article["title"] or "", article["snippet"] or article["full_text"] or "", keywords, cat_keys)
            time.sleep(0.2)

        fs = final_score(rs_with_bonus, ai_s)

        sb.from_("tenant_article_relevance").upsert({
            "tenant_id": tenant_id,
            "article_id": article["id"],
            "rule_score": rs_with_bonus,
            "ai_relevance_score": ai_s,
            "final_score": fs,
            "scored_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }, on_conflict="tenant_id,article_id").execute()


def main():
    print("=== Intel Brief ingestion start ===")
    start = time.time()

    # Load all feeds
    feeds_res = sb.from_("alert_feeds").select("*").execute()
    all_feeds = feeds_res.data or []
    global_feeds = [f for f in all_feeds if not f["tenant_id"]]
    print(f"Loaded {len(all_feeds)} feeds ({len(global_feeds)} global)")

    # Load all tenant settings
    settings_res = sb.from_("tenant_news_settings").select("*").execute()
    tenant_settings = settings_res.data or []
    print(f"Processing {len(tenant_settings)} tenant(s)")

    for ts in tenant_settings:
        tid = ts["tenant_id"]
        keywords = ts.get("keywords") or []
        categories = ts.get("categories") or []
        blacklist = ts.get("blacklisted_domains") or []

        # Feeds for this tenant: global + tenant-specific
        tenant_feeds = global_feeds + [f for f in all_feeds if f["tenant_id"] == tid]

        ingest_for_tenant(tid, keywords, categories, blacklist, tenant_feeds)
        backfill_unscored_articles(tid, keywords, categories, blacklist)

    elapsed = round(time.time() - start, 1)
    print(f"\n=== Done in {elapsed}s ===")


if __name__ == "__main__":
    main()
