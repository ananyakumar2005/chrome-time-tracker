// lib/categorizer.js
// Maps domains to categories, with user overrides taking priority.

export const DEFAULT_CATEGORIES = [
  { name: "social_media",  label: "Social Media",   color: "#e0568c" },
  { name: "studying",      label: "Studying",        color: "#4f8ff0" },
  { name: "entertainment", label: "Entertainment",   color: "#f0a94f" },
  { name: "work",          label: "Work",            color: "#4fbf7a" },
  { name: "other",         label: "Other",           color: "#9a9a9a" },
];

// Legacy flat array kept for backward compatibility with existing popup/options imports
export const CATEGORIES = DEFAULT_CATEGORIES.map((c) => c.name);

export const DEFAULT_DOMAIN_MAP = {
  // Social media
  "facebook.com":   "social_media",
  "instagram.com":  "social_media",
  "twitter.com":    "social_media",
  "x.com":          "social_media",
  "reddit.com":     "social_media",
  "tiktok.com":     "social_media",
  "linkedin.com":   "social_media",
  "snapchat.com":   "social_media",
  "pinterest.com":  "social_media",

  // Studying
  "coursera.org":       "studying",
  "khanacademy.org":    "studying",
  "wikipedia.org":      "studying",
  "edx.org":            "studying",
  "udemy.com":          "studying",
  "duolingo.com":       "studying",
  "quizlet.com":        "studying",
  "scholar.google.com": "studying",

  // Entertainment
  "youtube.com":    "entertainment",
  "netflix.com":    "entertainment",
  "twitch.tv":      "entertainment",
  "hulu.com":       "entertainment",
  "spotify.com":    "entertainment",
  "disneyplus.com": "entertainment",
  "primevideo.com": "entertainment",

  // Work
  "github.com":        "work",
  "gmail.com":         "work",
  "mail.google.com":   "work",
  "docs.google.com":   "work",
  "sheets.google.com": "work",
  "slack.com":         "work",
  "notion.so":         "work",
  "atlassian.net":     "work",
  "trello.com":        "work",
};

// Keyword fallback: substrings checked against the hostname.
const KEYWORD_RULES = [
  { pattern: /edu|course|lms|learn|academy|university/i, category: "studying" },
  { pattern: /game|stream|watch|video|movie|music/i,     category: "entertainment" },
  { pattern: /mail|docs|sheet|calendar|drive|jira|confluence/i, category: "work" },
  { pattern: /social|forum|chat/i,                       category: "social_media" },
];

/**
 * Normalize a hostname: strip "www.", lowercase, collapse common
 * mobile/regional subdomains so "m.youtube.com" == "youtube.com".
 */
export function normalizeDomain(hostname) {
  if (!hostname) return "";
  let host = hostname.toLowerCase();
  host = host.replace(/^www\./, "");
  host = host.replace(/^m\./, "");
  return host;
}

/**
 * Build the effective category list merging defaults + user custom categories.
 * @param {Array} customCategories — from storage.getCustomCategories()
 */
export function buildEffectiveCategories(customCategories = []) {
  const names = new Set(DEFAULT_CATEGORIES.map((c) => c.name));
  const merged = [...DEFAULT_CATEGORIES];
  for (const cat of customCategories) {
    if (!names.has(cat.name)) {
      merged.push(cat);
    }
  }
  return merged;
}

/**
 * Determine the category for a domain.
 * Priority: user override > default map > keyword fallback > "other"
 */
export function categorize(hostname, userOverrides = {}) {
  const domain = normalizeDomain(hostname);

  if (userOverrides[domain]) {
    return userOverrides[domain];
  }
  if (DEFAULT_DOMAIN_MAP[domain]) {
    return DEFAULT_DOMAIN_MAP[domain];
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(domain)) {
      return rule.category;
    }
  }

  return "other";
}
