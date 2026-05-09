// ============================================================
// FocusGuard Insights — popup.js
// Runs when the user clicks the extension icon.
// Reads today's data from storage via background.js,
// then renders: mascot, distance, platform chips, comparison,
// streak, and the mascot tip quote.
// ============================================================

'use strict';

// ─────────────────────────────────────────────────────────────
// SECTION 1: Constants & helpers
// These small utilities are used throughout the file.
// ─────────────────────────────────────────────────────────────

// How many minutes one reel is assumed to take (used for time estimate)
const MINS_PER_REEL = 1;

/** Format total minutes into "Xh Ym" or just "Ym" */
function fmtTime(totalMins) {
  if (totalMins < 1) return '0m';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Format meters into human-readable string */
function fmtDist(meters) {
  if (meters < 1)    return `${Math.round(meters * 100)} cm`;
  if (meters < 1000) return `${meters.toFixed(1)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

/** Get today's date string "YYYY-MM-DD" */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────
// SECTION 2: Storage reader
// Sends a message to background.js to get today's data.
// Background is the single source of truth for storage.
// ─────────────────────────────────────────────────────────────

async function getTodayData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_DAY', dateKey: todayKey() },
      (response) => {
        if (response && response.ok) {
          resolve(response.data);
        } else {
          // Return a blank day if something goes wrong
          resolve({ instagram: { count: 0, reelTimestamps: [] },
                    youtube:   { count: 0, reelTimestamps: [] },
                    sessions:  [] });
        }
      }
    );
  });
}

// ─────────────────────────────────────────────────────────────
// SECTION 3: Streak calculator
// Looks at the last 7 days of storage to build the streak row.
// A "clean" day = total reels < 20.
// ─────────────────────────────────────────────────────────────

async function getWeekStreak() {
  // Build an array of the last 7 date keys (today last)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  // Ask background for all stored dates
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_ALL_DATES' }, async (res) => {
      const allStoredCounts = (res && res.ok) ? res.data : {}; // { "YYYY-MM-DD": totalCount }
      const results = [];

      // For each of the 7 days, check if it was a clean day
      for (const dateKey of days) {
        const total = allStoredCounts[dateKey];
        if (total === undefined) { // No data for this day
          results.push({ date: dateKey, status: 'none' }); // no data
          continue;
        }
        // Use the pre-calculated total count
        results.push({ date: dateKey, status: total < 20 ? 'hit' : 'miss' });
      }
      resolve(results);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// SECTION 4: DOM render helpers
// Each function below updates one visual section of the popup.
// ─────────────────────────────────────────────────────────────

/** 4a. Render the mascot SVG and its mood label */
function renderMascotSection(totalReels) {
  const expression = getMascotExpression(totalReels);
  const color      = getMascotColor(expression);

  // Draw the mascot SVG into its container (from mascot.js)
  renderMascot(document.getElementById('mascot-wrap'), expression, 100);

  // Update the mood label text + color below the mascot
  const label = document.getElementById('mascot-mood-label');
  label.textContent = expression.charAt(0).toUpperCase() + expression.slice(1);
  label.style.color = color;
}

/** 4b. Render hero distance number and sub-label */
function renderHero(igCount, ytCount) {
  const total  = igCount + ytCount;
  const meters = reelsToMeters(total);           // from comparison.js
  const dist   = fmtDist(meters);
  const color  = total === 0 ? 'var(--blue)'
               : total < 60  ? 'var(--blue)'
               : total < 150 ? 'var(--amber)'
               :               'var(--red)';

  document.getElementById('hero-distance').innerHTML =
    `${dist}<span style="font-size:16px;font-weight:400;color:var(--text-secondary);"> distance</span>`;
  document.getElementById('hero-distance').style.color = color;

  document.getElementById('hero-reels-sub').textContent =
    total === 0 ? 'No reels tracked yet'
                : `${total} reel${total !== 1 ? 's' : ''} watched today`;
}

/** 4c. Render the mascot tip quote */
function renderTip(totalReels, distStr) {
  const expression = getMascotExpression(totalReels);
  const quote      = getMascotQuote(
    expression,
    { total: totalReels },
    { distStr }
  );
  document.getElementById('tip-text').textContent = quote;
}

/** 4d. Render the Instagram and YouTube platform chips */
function renderPlatformChips(igCount, ytCount) {
  document.getElementById('ig-count').textContent = igCount;
  document.getElementById('yt-count').textContent = ytCount;
}

/** 4e. Render the time lost chip using real session timestamps */
function renderTime(dayData) {
  const sessions = dayData.sessions || [];
  const sessionsExist = sessions.length > 0;

  // Use real session duration if available, otherwise fallback to 1 min/reel
  const total   = (dayData.instagram?.count || 0) + (dayData.youtube?.count || 0);
  const mins = sessionsExist
    ? sessions.reduce((acc, s) => acc + Math.max(1, Math.ceil((s.end - s.start) / 60000)), 0)
    : total; // fallback: 1 min per reel

  document.getElementById('time-value').textContent = fmtTime(mins);
}

// ── Dramatic lines per landmark ───────────────────────────
// Each entry: what to show when user has PASSED that landmark.
// Uses HTML so we can colour the landmark name.
const DRAMATIC_LINES = {
  book:      (d) => `Your thumb scrolled the height of <span class="drama-passed">📚 a stack of books</span> — ${d} of mindless scrolling.`,
  human:     (d) => `You scrolled <span class="drama-passed">🧍 the full height of a human being</span> today. ${d} gone.`,
  door:      (d) => `Your scroll reached <span class="drama-passed">🚪 door height</span>. That's ${d} of your thumb's life.`,
  room:      (d) => `You scrolled <span class="drama-passed">🏠 an entire room's height</span>. ${d} of reels. Was it worth it?`,
  bus:       (d) => `Your thumb climbed <span class="drama-passed">🚌 a double-decker bus</span> today. ${d} of shorts.`,
  building5: (d) => `<span class="drama-passed">🏢 A 5-floor building.</span> That's how far your thumb scrolled today. ${d}.`,
  cricket:   (d) => `You scrolled the length of <span class="drama-passed">🏏 a cricket pitch</span>. ${d} burned.`,
  tree:      (d) => `Your thumb reached the top of <span class="drama-passed">🌴 a tall tree</span>. ${d} of reels.`,
  building15:(d) => `<span class="drama-passed">🏗️ 15 floors up.</span> That's your scroll distance today. ${d}.`,
  liberty:   (d) => `You out-scrolled <span class="drama-passed">🗽 the Statue of Liberty</span>. ${d}. Seriously.`,
  football:  (d) => `A full <span class="drama-passed">⛳ football field</span> of scrolling. ${d}. Take a walk instead.`,
  eiffel:    (d) => `Your thumb conquered <span class="drama-passed">🗼 the Eiffel Tower</span>. ${d}. This is not normal.`,
  burj:      (d) => `<span class="drama-passed">🏙️ The Burj Khalifa.</span> Your thumb climbed it all. ${d}. Seek help.`,
  hill:      (d) => `You scrolled the height of <span class="drama-passed">🏞️ a small hill</span>. ${d}. Unreal.`,
  everest:   (d) => `<span class="drama-passed">🏔️ Mount Everest.</span> Your thumb summited it in reels. ${d}. How?`,
  flight:    (d) => `<span class="drama-passed">✈️ Airplane altitude.</span> Your thumb is in the clouds. ${d}.`,
};

const DRAMATIC_ZERO = `Your thumb hasn't scrolled yet today. <span class="drama-highlight">Keep it that way.</span>`;
const DRAMATIC_APPROACHING = (next, d) =>
  `Your thumb has scrolled <span class="drama-highlight">${d}</span> — approaching the ${next.emoji} ${next.name}.`;

/** 4f. Render the real-world comparison section */
function renderComparison(totalReels) {
  const meters = reelsToMeters(totalReels);
  const ctx    = getLandmarkContext(meters);
  const pct    = Math.min(100, Math.round((meters / ctx.next.meters) * 100));
  const rem    = Math.max(0, ctx.next.meters - meters);
  const dist   = fmtDist(meters);

  // ── Dramatic line ──
  const dramaticEl = document.getElementById('comp-dramatic');
  if (totalReels === 0) {
    dramaticEl.innerHTML = DRAMATIC_ZERO;
  } else if (ctx.passed && DRAMATIC_LINES[ctx.passed.id]) {
    dramaticEl.innerHTML = DRAMATIC_LINES[ctx.passed.id](dist);
  } else {
    dramaticEl.innerHTML = DRAMATIC_APPROACHING(ctx.next, dist);
  }

  // ── Hero emoji — show next landmark big ──
  document.getElementById('comp-hero-emoji').textContent = ctx.next.emoji;

  // ── Sub dist ──
  document.getElementById('comp-sub').textContent =
    `${dist} scrolled · ${totalReels} reels × 15 cm`;

  // ── Progress bar ──
  document.getElementById('comp-prog-fill').style.width = (totalReels === 0 ? 0 : Math.max(2, pct)) + '%';
  document.getElementById('comp-prog-you').textContent  = totalReels > 0 ? dist : '';
  document.getElementById('comp-prog-target').textContent = fmtDist(ctx.next.meters);

  // ── Passed chip ──
  const passedChip = document.getElementById('comp-chip-passed');
  if (ctx.passed) {
    passedChip.style.display = '';
    document.getElementById('comp-passed-emoji').textContent = ctx.passed.emoji;
    document.getElementById('comp-passed-name').textContent  = ctx.passed.name;
    document.getElementById('comp-passed-sub').textContent   = `${fmtDist(ctx.passed.meters)} · 100%`;
    document.getElementById('comp-chip-next').style.gridColumn = '';
  } else {
    passedChip.style.display = 'none';
    document.getElementById('comp-chip-next').style.gridColumn = '1 / -1';
  }

  // ── Next chip ──
  document.getElementById('comp-next-emoji').textContent = ctx.next.emoji;
  document.getElementById('comp-next-name').textContent  = ctx.next.name;
  document.getElementById('comp-next-sub').textContent   = `${fmtDist(rem)} away`;
}

/** 4g. Render the 7-day streak dots */
function renderStreak(weekData) {
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const container = document.getElementById('streak-dots');
  container.innerHTML = '';

  weekData.forEach((day, i) => {
    const dot = document.createElement('div');
    dot.className = `streak-dot streak-dot--${day.status}`;
    dot.textContent = labels[i];
    dot.title = day.date;
    container.appendChild(dot);
  });

  // Count current streak (consecutive hits ending at today)
  let streak = 0;
  for (let i = weekData.length - 1; i >= 0; i--) {
    if (weekData[i].status === 'hit') streak++;
    else break;
  }

  const info = document.getElementById('streak-info');
  if (streak === 0) {
    info.textContent = 'Stay under 20 reels/day to build your streak.';
  } else {
    info.textContent = `${streak}-day clean streak! Stay under 20 reels to protect it.`;
    info.style.color = 'var(--green)';
  }
}

/** 4h. Render the tone bar at the bottom (only visible above level 1) */
function renderToneBar(totalReels) {
  const meters  = reelsToMeters(totalReels);
  const ctx     = getLandmarkContext(meters);
  const toneBar = document.getElementById('tone-bar');

  if (ctx.level <= 1 || totalReels === 0) {
    toneBar.style.display = 'none';
  } else {
    toneBar.style.display = 'block';
    toneBar.textContent   = ctx.tone;
    // Color the tone bar based on severity
    const colors = { 2:'var(--blue)', 3:'var(--amber)', 4:'var(--amber)', 5:'var(--red)', 6:'var(--red)' };
    toneBar.style.color = colors[ctx.level] || 'var(--text-secondary)';
  }
}

// ─────────────────────────────────────────────────────────────
// SECTION 5: Main initialiser
// Called once when the popup opens. Fetches data, then calls
// all the render helpers above in sequence.
// ─────────────────────────────────────────────────────────────

async function init() {
  // 1. Fetch today's tracking data from storage (via background.js)
  const dayData = await getTodayData();

  const igCount = dayData.instagram ? dayData.instagram.count : 0;
  const ytCount = dayData.youtube   ? dayData.youtube.count   : 0;
  const total   = igCount + ytCount;
  const meters  = reelsToMeters(total);
  const distStr = fmtDist(meters);

  // 2. Render each visual section in order
  renderMascotSection(total);           // mascot face + label
  renderHero(igCount, ytCount);  // big distance number
  renderTip(total, distStr);     // mascot tip quote
  renderPlatformChips(igCount, ytCount); // IG / YT chips
  renderTime(dayData);             // time lost estimate
  renderComparison(total);       // SVG + passed/next landmarks
  renderToneBar(total);          // severity tone bar

  // 3. Load streak (async, slightly slower — fills in after)
  getWeekStreak().then(renderStreak);

  // 4. Open dashboard button
  document.getElementById('open-dashboard-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    window.close(); // close popup after opening dashboard
  });
}

// ─────────────────────────────────────────────────────────────
// SECTION 6: Kick everything off when DOM is ready
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);