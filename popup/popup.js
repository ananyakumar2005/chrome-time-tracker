import { getRangeUsage, getCustomCategories } from "../lib/storage.js";
import { buildEffectiveCategories } from "../lib/categorizer.js";

const CIRCUMFERENCE = 2 * Math.PI * 62; // ~389.56 for radius 62

let currentRange = 1;
let liveTimerInterval = null;

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (m > 0) {
    return `${m}m`;
  }
  return `${s}s`;
}

function formatLiveTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

/** Render the SVG donut chart segments */
function renderDonut(categoriesWithUsage, totalSeconds) {
  const g = document.getElementById("donut-segments");
  g.innerHTML = "";

  if (totalSeconds <= 0) return;

  let cumulativeLength = 0;

  for (const cat of categoriesWithUsage) {
    if (cat.seconds <= 0) continue;

    const fraction = cat.seconds / totalSeconds;
    const segmentLength = fraction * CIRCUMFERENCE;

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "80");
    circle.setAttribute("cy", "80");
    circle.setAttribute("r", "62");
    circle.setAttribute("class", "donut-segment");
    circle.setAttribute("stroke", cat.color);
    circle.setAttribute("stroke-dasharray", `${segmentLength} ${CIRCUMFERENCE}`);
    circle.setAttribute("stroke-dashoffset", `-${cumulativeLength}`);

    // Tooltip title
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${cat.label}: ${formatDuration(cat.seconds)} (${Math.round(fraction * 100)}%)`;
    circle.appendChild(title);

    g.appendChild(circle);

    cumulativeLength += segmentLength;
  }
}

async function render(numDays) {
  const [usage, customCats] = await Promise.all([
    getRangeUsage(numDays),
    getCustomCategories()
  ]);

  const effectiveCategories = buildEffectiveCategories(customCats);
  const categoryMap = {};
  for (const c of effectiveCategories) {
    categoryMap[c.name] = { ...c, seconds: 0 };
  }

  const entries = Object.entries(usage); // [domain, {seconds, category}]
  const totalSeconds = entries.reduce((sum, [, v]) => sum + (v.seconds || 0), 0);

  document.getElementById("total-time").textContent = formatDuration(totalSeconds);

  // Group usage by category
  for (const [, v] of entries) {
    const catName = v.category || "other";
    if (!categoryMap[catName]) {
      categoryMap[catName] = {
        name: catName,
        label: catName.replace("_", " "),
        color: "#64748b",
        seconds: 0
      };
    }
    categoryMap[catName].seconds += (v.seconds || 0);
  }

  const categoryList = Object.values(categoryMap);
  const activeCategories = categoryList.filter((c) => c.seconds > 0);

  // Update category summary counter
  document.getElementById("category-summary").textContent = `${activeCategories.length} active`;

  // Render donut chart
  renderDonut(categoryList, totalSeconds);

  // Render category bars
  const barsContainer = document.getElementById("category-bars");
  barsContainer.innerHTML = "";

  if (activeCategories.length === 0) {
    barsContainer.innerHTML = `<div class="empty-state">No time tracked in this period.</div>`;
  } else {
    // Sort highest usage first
    const sortedCategories = [...categoryList].sort((a, b) => b.seconds - a.seconds);

    for (const cat of sortedCategories) {
      if (cat.seconds <= 0 && activeCategories.length > 0) continue;

      const pct = totalSeconds > 0 ? (cat.seconds / totalSeconds) * 100 : 0;
      const row = document.createElement("div");
      row.className = "category-row";
      row.innerHTML = `
        <div class="cat-label-wrap">
          <span class="cat-dot" style="background-color: ${cat.color}"></span>
          <span class="cat-name" title="${cat.label}">${cat.label}</span>
        </div>
        <div class="cat-track">
          <div class="cat-fill" style="width: ${pct}%; background-color: ${cat.color}"></div>
        </div>
        <span class="cat-time">${formatDuration(cat.seconds)}</span>
      `;
      barsContainer.appendChild(row);
    }
  }

  // Render top domains list
  const list = document.getElementById("domain-list");
  list.innerHTML = "";

  const sortedSites = entries
    .filter(([, info]) => info.seconds > 0)
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .slice(0, 10);

  if (sortedSites.length === 0) {
    list.innerHTML = `<li class="empty-state">Browse pages to see activity here.</li>`;
  } else {
    for (const [domain, info] of sortedSites) {
      const catConfig = categoryMap[info.category] || {
        label: info.category,
        color: "#64748b"
      };

      const li = document.createElement("li");
      li.className = "domain-item";
      li.innerHTML = `
        <div class="domain-info">
          <span class="domain-name" title="${domain}">${domain}</span>
          <span class="domain-badge" style="background-color: ${catConfig.color}20; color: ${catConfig.color};">
            ${catConfig.label}
          </span>
        </div>
        <span class="domain-duration">${formatDuration(info.seconds)}</span>
      `;
      list.appendChild(li);
    }
  }
}

/** Check if there is an active browsing session in the background */
function pollActiveSession() {
  chrome.runtime.sendMessage({ type: "GET_CURRENT_SESSION" }, (response) => {
    if (chrome.runtime.lastError || !response || !response.domain) {
      document.getElementById("live-session").classList.add("hidden");
      if (liveTimerInterval) {
        clearInterval(liveTimerInterval);
        liveTimerInterval = null;
      }
      return;
    }

    const livePill = document.getElementById("live-session");
    const domainEl = document.getElementById("live-domain");
    const timerEl = document.getElementById("live-timer");

    livePill.classList.remove("hidden");
    domainEl.textContent = response.domain;

    let elapsed = response.elapsedSeconds || 0;
    timerEl.textContent = formatLiveTimer(elapsed);

    if (liveTimerInterval) clearInterval(liveTimerInterval);
    liveTimerInterval = setInterval(() => {
      elapsed += 1;
      timerEl.textContent = formatLiveTimer(elapsed);
    }, 1000);
  });
}

// Range toggle buttons
document.querySelectorAll(".range-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentRange = Number(btn.dataset.range);
    render(currentRange);
  });
});

// Options page navigation
document.getElementById("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Initial render
render(currentRange);
pollActiveSession();
