import {
  getRangeUsage,
  getDailyTotals,
  getOverrides,
  setOverride,
  removeOverride,
  getCustomCategories,
  upsertCustomCategory,
  removeCustomCategory,
  getGoals,
  setGoal
} from "../lib/storage.js";
import { DEFAULT_CATEGORIES, buildEffectiveCategories } from "../lib/categorizer.js";

// Format seconds into readable string (e.g., "2h 15m")
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

// Format date string for display (e.g. "Sep 5")
function formatDateLabel(dateStr) {
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ----------------------------------------------------
// Tab Navigation
// ----------------------------------------------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));

    btn.classList.add("active");
    const tabId = `tab-${btn.dataset.tab}`;
    const target = document.getElementById(tabId);
    if (target) target.classList.add("active");

    // Refresh contents if switching to specific tabs
    if (btn.dataset.tab === "history") renderHistoryChart();
    if (btn.dataset.tab === "domains") renderDomainRules();
    if (btn.dataset.tab === "categories") renderCategories();
    if (btn.dataset.tab === "goals") renderGoals();
  });
});

// ----------------------------------------------------
// 1. History & Trends Chart
// ----------------------------------------------------
async function renderHistoryChart() {
  const dailyData = await getDailyTotals(30); // [{ date, seconds }, ...] oldest to newest
  const svg = document.getElementById("history-chart");
  const tooltip = document.getElementById("chart-tooltip");
  const badge = document.getElementById("history-total-badge");

  const totalSecs = dailyData.reduce((acc, d) => acc + d.seconds, 0);
  const totalHours = (totalSecs / 3600).toFixed(1);
  badge.textContent = `Total: ${totalHours}h (30d)`;

  svg.innerHTML = "";

  const width = 800;
  const height = 220;
  const paddingBottom = 28;
  const paddingTop = 20;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxSecs = Math.max(...dailyData.map((d) => d.seconds), 3600); // at least 1h scale

  // Grid lines
  for (let i = 0; i <= 3; i++) {
    const y = paddingTop + (chartHeight / 3) * i;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", y.toString());
    line.setAttribute("x2", width.toString());
    line.setAttribute("y2", y.toString());
    line.setAttribute("stroke", "rgba(255, 255, 255, 0.06)");
    line.setAttribute("stroke-dasharray", "4 4");
    svg.appendChild(line);
  }

  const barCount = dailyData.length;
  const slotWidth = width / barCount;
  const barWidth = Math.max(slotWidth - 6, 8);

  dailyData.forEach((day, index) => {
    const barH = day.seconds > 0 ? Math.max((day.seconds / maxSecs) * chartHeight, 4) : 0;
    const x = index * slotWidth + (slotWidth - barWidth) / 2;
    const y = height - paddingBottom - barH;

    if (barH > 0) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x.toString());
      rect.setAttribute("y", y.toString());
      rect.setAttribute("width", barWidth.toString());
      rect.setAttribute("height", barH.toString());
      rect.setAttribute("rx", "3");
      rect.setAttribute("fill", "#38bdf8");
      rect.setAttribute("class", "chart-bar");

      // Hover tooltip interactions
      rect.addEventListener("mouseenter", (e) => {
        tooltip.textContent = `${formatDateLabel(day.date)}: ${formatDuration(day.seconds)}`;
        tooltip.classList.remove("hidden");
        const svgRect = svg.getBoundingClientRect();
        tooltip.style.left = `${(x / width) * svgRect.width}px`;
        tooltip.style.top = `${(y / height) * svgRect.height}px`;
      });

      rect.addEventListener("mouseleave", () => {
        tooltip.classList.add("hidden");
      });

      svg.appendChild(rect);
    }

    // Show date labels for every ~5 days
    if (index % 5 === 0 || index === barCount - 1) {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", (x + barWidth / 2).toString());
      text.setAttribute("y", (height - 6).toString());
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#64748b");
      text.setAttribute("font-size", "10");
      text.textContent = formatDateLabel(day.date);
      svg.appendChild(text);
    }
  });
}

// ----------------------------------------------------
// 2. Domain Categorization Rules
// ----------------------------------------------------
let cachedUsage = {};
let cachedOverrides = {};
let cachedCategories = [];

async function renderDomainRules() {
  const [usage, overrides, customCats] = await Promise.all([
    getRangeUsage(30),
    getOverrides(),
    getCustomCategories()
  ]);

  cachedUsage = usage;
  cachedOverrides = overrides;
  cachedCategories = buildEffectiveCategories(customCats);

  populateDomainTable();
}

function populateDomainTable(filterText = "") {
  const tbody = document.getElementById("domain-rows");
  tbody.innerHTML = "";

  const query = filterText.toLowerCase().trim();
  const sorted = Object.entries(cachedUsage)
    .filter(([domain]) => !query || domain.toLowerCase().includes(query))
    .sort((a, b) => b[1].seconds - a[1].seconds);

  if (sorted.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">No domains found.</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const [domain, info] of sorted) {
    const tr = document.createElement("tr");
    const isOverridden = Boolean(cachedOverrides[domain]);

    const optionsHtml = cachedCategories
      .map(
        (cat) =>
          `<option value="${cat.name}" ${cat.name === info.category ? "selected" : ""}>
            ${cat.label}
          </option>`
      )
      .join("");

    tr.innerHTML = `
      <td class="domain-cell">${domain}</td>
      <td>${formatDuration(info.seconds)}</td>
      <td>
        <select class="cat-select" data-domain="${domain}">
          ${optionsHtml}
        </select>
      </td>
      <td>
        ${
          isOverridden
            ? `<button class="btn btn-secondary btn-sm reset-btn" data-domain="${domain}">Reset</button>`
            : `<span style="color: var(--text-muted); font-size: 11px;">Default</span>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Category change event
  tbody.querySelectorAll(".cat-select").forEach((select) => {
    select.addEventListener("change", async (e) => {
      const domain = e.target.dataset.domain;
      const newCategory = e.target.value;
      await setOverride(domain, newCategory);
      cachedOverrides[domain] = newCategory;
      populateDomainTable(document.getElementById("domain-search").value);
    });
  });

  // Reset override button
  tbody.querySelectorAll(".reset-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const domain = e.target.dataset.domain;
      await removeOverride(domain);
      delete cachedOverrides[domain];
      await renderDomainRules();
    });
  });
}

// Domain filter search
document.getElementById("domain-search").addEventListener("input", (e) => {
  populateDomainTable(e.target.value);
});

// ----------------------------------------------------
// 3. Custom Categories
// ----------------------------------------------------
async function renderCategories() {
  const customCats = await getCustomCategories();
  const allCategories = buildEffectiveCategories(customCats);
  const grid = document.getElementById("categories-list");
  grid.innerHTML = "";

  for (const cat of allCategories) {
    const isCustom = customCats.some((c) => c.name === cat.name);
    const card = document.createElement("div");
    card.className = "category-card";

    card.innerHTML = `
      <div class="category-badge-wrap">
        <span class="cat-chip" style="background-color: ${cat.color}"></span>
        <div>
          <div class="cat-title">${cat.label}</div>
          <div class="cat-id-sub">${cat.name} ${isCustom ? "• Custom" : "• Built-in"}</div>
        </div>
      </div>
      ${
        isCustom
          ? `<button class="btn btn-danger btn-sm del-cat-btn" data-name="${cat.name}">Delete</button>`
          : `<span style="font-size: 11px; color: var(--text-muted);">Standard</span>`
      }
    `;
    grid.appendChild(card);
  }

  grid.querySelectorAll(".del-cat-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const name = e.target.dataset.name;
      if (confirm(`Delete custom category "${name}"? Existing items will revert to "other".`)) {
        await removeCustomCategory(name);
        renderCategories();
      }
    });
  });
}

// Add category form
document.getElementById("category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("cat-name-input").value.trim().toLowerCase().replace(/\s+/g, "_");
  const label = document.getElementById("cat-label-input").value.trim();
  const color = document.getElementById("cat-color-input").value;

  if (!name || !label) return;

  await upsertCustomCategory(name, label, color);
  document.getElementById("category-form").reset();
  renderCategories();
});

// ----------------------------------------------------
// 4. Daily Goals & Limits
// ----------------------------------------------------
async function renderGoals() {
  const [goals, customCats] = await Promise.all([
    getGoals(),
    getCustomCategories()
  ]);

  const allCategories = buildEffectiveCategories(customCats);
  const container = document.getElementById("goals-container");
  container.innerHTML = "";

  for (const cat of allCategories) {
    const currentLimitSeconds = goals[cat.name] || 0;
    const currentLimitMinutes = currentLimitSeconds > 0 ? Math.round(currentLimitSeconds / 60) : "";

    const div = document.createElement("div");
    div.className = "goal-item";
    div.innerHTML = `
      <div class="goal-category-info">
        <span class="cat-chip" style="background-color: ${cat.color}"></span>
        <strong>${cat.label}</strong>
      </div>
      <div class="goal-input-group">
        <input type="number" min="0" max="1440" step="5" placeholder="None"
               value="${currentLimitMinutes}" class="goal-input" data-cat="${cat.name}" />
        <span style="font-size: 12px; color: var(--text-muted);">min/day</span>
        <button class="btn btn-primary btn-sm save-goal-btn" data-cat="${cat.name}">Save</button>
      </div>
    `;
    container.appendChild(div);
  }

  container.querySelectorAll(".save-goal-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const catName = e.target.dataset.cat;
      const input = container.querySelector(`input[data-cat="${catName}"]`);
      const minutes = parseInt(input.value, 10);
      const seconds = !isNaN(minutes) && minutes > 0 ? minutes * 60 : 0;

      await setGoal(catName, seconds);
      btn.textContent = "Saved!";
      setTimeout(() => {
        btn.textContent = "Save";
      }, 1500);
    });
  });
}

// ----------------------------------------------------
// 5. Data Export & Storage
// ----------------------------------------------------
document.getElementById("export-json-btn").addEventListener("click", async () => {
  const allData = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reading-time-data-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("export-csv-btn").addEventListener("click", async () => {
  const allData = await chrome.storage.local.get(null);
  let csv = "Date,Domain,Category,Seconds,Minutes\n";

  for (const [key, dayUsage] of Object.entries(allData)) {
    if (!key.startsWith("usage:")) continue;
    const date = key.replace("usage:", "");

    for (const [domain, info] of Object.entries(dayUsage)) {
      const sec = info.seconds || 0;
      const mins = (sec / 60).toFixed(1);
      csv += `"${date}","${domain}","${info.category}",${sec},${mins}\n`;
    }
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reading-time-data-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("clear-data-btn").addEventListener("click", async () => {
  const confirmed = confirm(
    "⚠️ WARNING: This will permanently delete all browsing records, custom categories, and goals. Are you sure?"
  );
  if (!confirmed) return;

  await chrome.storage.local.clear();
  alert("All tracker data has been reset.");
  location.reload();
});

// Initial tab load
renderHistoryChart();
