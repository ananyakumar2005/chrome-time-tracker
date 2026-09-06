// background.js — MV3 service worker
// Event-driven time tracking: instead of a continuous timer (which MV3
// service workers can't reliably keep alive), we record a start timestamp
// whenever a domain becomes "active" and compute the elapsed delta whenever
// it stops being active (tab switch, window blur, idle, or shutdown).

import { categorize, normalizeDomain, DEFAULT_CATEGORIES, buildEffectiveCategories } from "./lib/categorizer.js";
import {
  addTime,
  getOverrides,
  pruneOldData,
  getGoals,
  getTodayCategoryTotals,
  getCustomCategories,
  todayKey
} from "./lib/storage.js";

const IDLE_THRESHOLD_SECONDS = 60;

// In-memory session state. Lost on service worker restart, but we flush
// to storage on every state change, so at most a few seconds are ever at risk.
let session = {
  domain: null,
  startTime: null,
  lastContentActivity: Date.now()
};

// Track which goals were already alerted today to prevent spamming notifications
const notifiedGoalsToday = new Set();
let lastNotifiedDate = todayKey();

chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

/** Format seconds into compact string for the extension badge (e.g., "12m", "1.5h"). */
function formatBadge(seconds) {
  if (!seconds || seconds < 30) return "";
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m`;
  }
  const hours = seconds / 3600;
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

/** Update extension icon badge with today's total reading time. */
async function updateBadge() {
  try {
    const totals = await getTodayCategoryTotals();
    const totalSeconds = Object.values(totals).reduce((sum, s) => sum + (s || 0), 0);
    const badgeText = formatBadge(totalSeconds);
    await chrome.action.setBadgeText({ text: badgeText });
    await chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });
  } catch (err) {
    console.error("Failed to update badge:", err);
  }
}

/** Check if today's reading in any category has breached user-set goals. */
async function checkGoals() {
  const currentDateKey = todayKey();
  if (currentDateKey !== lastNotifiedDate) {
    notifiedGoalsToday.clear();
    lastNotifiedDate = currentDateKey;
  }

  const [goals, totals, customCats] = await Promise.all([
    getGoals(),
    getTodayCategoryTotals(),
    getCustomCategories()
  ]);

  const allCategories = buildEffectiveCategories(customCats);
  const categoryLabelMap = {};
  for (const c of allCategories) {
    categoryLabelMap[c.name] = c.label || c.name;
  }

  for (const [category, goalSeconds] of Object.entries(goals)) {
    if (!goalSeconds || goalSeconds <= 0) continue;
    const spentSeconds = totals[category] || 0;

    if (spentSeconds >= goalSeconds && !notifiedGoalsToday.has(category)) {
      notifiedGoalsToday.add(category);
      const label = categoryLabelMap[category] || category.replace("_", " ");
      const limitMinutes = Math.round(goalSeconds / 60);

      chrome.notifications.create(`goal-limit-${category}-${Date.now()}`, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Daily Goal Reached",
        message: `You've reached your daily limit of ${limitMinutes} min on ${label}.`,
        priority: 1
      });
    }
  }
}

/** Stop the current session and persist elapsed time, if any. */
async function flushSession() {
  if (!session.domain || !session.startTime) return;

  const elapsedSeconds = Math.round((Date.now() - session.startTime) / 1000);
  const domain = session.domain;

  session.domain = null;
  session.startTime = null;

  if (elapsedSeconds <= 0) return;

  const overrides = await getOverrides();
  const category = categorize(domain, overrides);
  await addTime(domain, category, elapsedSeconds);

  // Update badge and check user limits
  await updateBadge();
  await checkGoals();
}

/** Start a new session for the given domain. */
function startSession(domain) {
  session.domain = domain;
  session.startTime = Date.now();
  session.lastContentActivity = Date.now();
}

/** Extract a normalized domain from a tab's URL, or null if not trackable. */
function domainFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null; // skip chrome://, file://, etc.
    return normalizeDomain(parsed.hostname);
  } catch {
    return null;
  }
}

/** Re-evaluate which domain (if any) should currently be tracked. */
async function refreshActiveSession() {
  await flushSession();

  // Don't track if Chrome doesn't have OS focus.
  const win = await chrome.windows.getLastFocused({ populate: false });
  if (!win || win.focused === false) return;

  const [activeTab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!activeTab) return;

  const domain = domainFromUrl(activeTab.url);
  if (domain) startSession(domain);
}

// --- Event listeners -------------------------------------------------

chrome.tabs.onActivated.addListener(() => {
  refreshActiveSession();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only react when the active tab's URL actually changes.
  if (changeInfo.url && tab.active) {
    refreshActiveSession();
  }
});

chrome.tabs.onRemoved.addListener(() => {
  refreshActiveSession();
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Chrome lost OS focus entirely.
    flushSession();
  } else {
    refreshActiveSession();
  }
});

chrome.idle.onStateChanged.addListener((state) => {
  if (state === "idle" || state === "locked") {
    flushSession();
  } else if (state === "active") {
    refreshActiveSession();
  }
});

// Communication with popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CONTENT_ACTIVE") {
    session.lastContentActivity = Date.now();
    sendResponse({ received: true });
    return true;
  }

  if (message?.type === "GET_CURRENT_SESSION") {
    const currentElapsed = session.startTime
      ? Math.round((Date.now() - session.startTime) / 1000)
      : 0;
    sendResponse({
      domain: session.domain,
      startTime: session.startTime,
      elapsedSeconds: currentElapsed
    });
    return true;
  }

  if (message?.type === "FORCE_FLUSH") {
    refreshActiveSession().then(() => sendResponse({ flushed: true }));
    return true;
  }
});

// Periodic safety flush: caps how much time could be lost if the service
// worker is killed unexpectedly, and re-establishes the session afterward.
chrome.alarms.create("periodic-flush", { periodInMinutes: 0.5 });
chrome.alarms.create("daily-prune", { periodInMinutes: 60 * 24 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "periodic-flush") {
    refreshActiveSession();
  } else if (alarm.name === "daily-prune") {
    pruneOldData(90);
  }
});

chrome.runtime.onSuspend.addListener(() => {
  flushSession();
});

// Initialize on service worker startup
refreshActiveSession();
updateBadge();
pruneOldData(90);
