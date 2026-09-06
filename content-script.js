// content-script.js
// Detects genuine user activity on the page and notifies the background
// service worker so it can accurately determine "actively reading" vs an
// open-but-ignored tab.

const HEARTBEAT_INTERVAL_MS = 5_000; // report at most once per 5 s while active
const ACTIVITY_EVENTS = ["scroll", "click", "keydown", "mousemove", "touchstart"];

let lastActivityAt = 0;
let heartbeatTimer = null;

function onActivity() {
  lastActivityAt = Date.now();
  scheduleHeartbeat();
}

function scheduleHeartbeat() {
  if (heartbeatTimer !== null) return; // already scheduled
  heartbeatTimer = setTimeout(() => {
    heartbeatTimer = null;
    const elapsed = Date.now() - lastActivityAt;
    if (elapsed < HEARTBEAT_INTERVAL_MS * 1.5) {
      // User was genuinely active recently
      chrome.runtime.sendMessage({ type: "CONTENT_ACTIVE" }).catch(() => {
        // Service worker may be sleeping — that's fine; the event-driven
        // background tracking already handles focus/blur correctly.
      });
    }
  }, HEARTBEAT_INTERVAL_MS);
}

// Throttle: only register one listener per event type
for (const evt of ACTIVITY_EVENTS) {
  window.addEventListener(evt, onActivity, { passive: true, capture: true });
}
