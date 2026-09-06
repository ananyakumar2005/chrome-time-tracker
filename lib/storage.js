// lib/storage.js
// Thin wrapper around chrome.storage.local for daily usage records,
// user category overrides, custom categories, and per-category goals.

/** Returns today's date key, e.g. "usage:2026-09-07" */
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `usage:${y}-${m}-${d}`;
}

/** Get the full usage record for a given day (defaults to today). */
export async function getDayUsage(dateKey = todayKey()) {
  const result = await chrome.storage.local.get(dateKey);
  return result[dateKey] || {};
}

/**
 * Add elapsed seconds for a domain on a given day.
 * Creates the entry if it doesn't exist yet.
 */
export async function addTime(domain, category, seconds, dateKey = todayKey()) {
  if (!domain || seconds <= 0) return;

  const dayUsage = await getDayUsage(dateKey);

  if (!dayUsage[domain]) {
    dayUsage[domain] = { seconds: 0, category };
  }
  dayUsage[domain].seconds += seconds;
  dayUsage[domain].category = category; // keep category fresh if overrides changed

  await chrome.storage.local.set({ [dateKey]: dayUsage });
}

/** Get user category overrides: { "news.ycombinator.com": "work" } */
export async function getOverrides() {
  const result = await chrome.storage.local.get("userOverrides");
  return result.userOverrides || {};
}

/** Save a single override. */
export async function setOverride(domain, category) {
  const overrides = await getOverrides();
  overrides[domain] = category;
  await chrome.storage.local.set({ userOverrides: overrides });
}

/** Remove an override (falls back to default map / keyword rules). */
export async function removeOverride(domain) {
  const overrides = await getOverrides();
  delete overrides[domain];
  await chrome.storage.local.set({ userOverrides: overrides });
}

/**
 * Get usage summed across the last N days (inclusive of today).
 * Returns { domain: { seconds, category } }
 */
export async function getRangeUsage(numDays = 7) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < numDays; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(todayKey(d));
  }

  const stored = await chrome.storage.local.get(keys);
  const merged = {};

  for (const key of keys) {
    const dayUsage = stored[key] || {};
    for (const [domain, info] of Object.entries(dayUsage)) {
      if (!merged[domain]) {
        merged[domain] = { seconds: 0, category: info.category };
      }
      merged[domain].seconds += info.seconds;
      merged[domain].category = info.category;
    }
  }

  return merged;
}

/**
 * Get daily totals for the last N days for a history chart.
 * Returns [{ date: "YYYY-MM-DD", seconds: N }, ...] oldest first.
 */
export async function getDailyTotals(numDays = 30) {
  const keys = [];
  const dates = [];
  const now = new Date();
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    keys.push(key);
    dates.push(key.replace("usage:", ""));
  }

  const stored = await chrome.storage.local.get(keys);

  return dates.map((date, idx) => {
    const dayUsage = stored[keys[idx]] || {};
    const seconds = Object.values(dayUsage).reduce((s, v) => s + (v.seconds || 0), 0);
    return { date, seconds };
  });
}

/**
 * Get category-level daily breakdown for the last N days.
 * Returns [{ date, byCategory: { social_media: N, ... } }, ...] oldest first.
 */
export async function getDailyByCategory(numDays = 30) {
  const keys = [];
  const dates = [];
  const now = new Date();
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    keys.push(key);
    dates.push(key.replace("usage:", ""));
  }

  const stored = await chrome.storage.local.get(keys);

  return dates.map((date, idx) => {
    const dayUsage = stored[keys[idx]] || {};
    const byCategory = {};
    for (const info of Object.values(dayUsage)) {
      byCategory[info.category] = (byCategory[info.category] || 0) + (info.seconds || 0);
    }
    return { date, byCategory };
  });
}

/** Get today's per-category totals. Returns { social_media: N, ... } */
export async function getTodayCategoryTotals() {
  const dayUsage = await getDayUsage();
  const byCategory = {};
  for (const info of Object.values(dayUsage)) {
    byCategory[info.category] = (byCategory[info.category] || 0) + (info.seconds || 0);
  }
  return byCategory;
}

/** ---------- Custom categories ---------- */

/**
 * Get custom user-defined categories.
 * Returns [{ name: "fun_stuff", label: "Fun Stuff", color: "#ff6b6b" }, ...]
 */
export async function getCustomCategories() {
  const result = await chrome.storage.local.get("customCategories");
  return result.customCategories || [];
}

/** Save the full list of custom categories. */
export async function setCustomCategories(categories) {
  await chrome.storage.local.set({ customCategories: categories });
}

/** Add or update a custom category. */
export async function upsertCustomCategory(name, label, color) {
  const cats = await getCustomCategories();
  const idx = cats.findIndex((c) => c.name === name);
  if (idx >= 0) {
    cats[idx] = { name, label, color };
  } else {
    cats.push({ name, label, color });
  }
  await setCustomCategories(cats);
}

/** Remove a custom category by name. */
export async function removeCustomCategory(name) {
  const cats = await getCustomCategories();
  await setCustomCategories(cats.filter((c) => c.name !== name));
}

/** ---------- Goals ---------- */

/**
 * Get daily time limits per category.
 * Returns { social_media: 3600, entertainment: 7200, ... } (values in seconds)
 */
export async function getGoals() {
  const result = await chrome.storage.local.get("categoryGoals");
  return result.categoryGoals || {};
}

/** Set a daily goal for one category (seconds). Pass null/0 to clear. */
export async function setGoal(category, seconds) {
  const goals = await getGoals();
  if (!seconds || seconds <= 0) {
    delete goals[category];
  } else {
    goals[category] = seconds;
  }
  await chrome.storage.local.set({ categoryGoals: goals });
}

/** ---------- Data retention ---------- */

/**
 * Delete usage keys older than maxAgeDays.
 * Safe to call periodically (e.g. on the periodic alarm).
 */
export async function pruneOldData(maxAgeDays = 90) {
  const all = await chrome.storage.local.get(null);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const toRemove = [];
  for (const key of Object.keys(all)) {
    if (!key.startsWith("usage:")) continue;
    const dateStr = key.replace("usage:", ""); // "YYYY-MM-DD"
    const date = new Date(dateStr);
    if (!isNaN(date) && date < cutoff) {
      toRemove.push(key);
    }
  }

  if (toRemove.length > 0) {
    await chrome.storage.local.remove(toRemove);
  }
}
