// ============================================================
// FocusGuard Insights — dashboard.js
// Full-page dashboard. Reads data from storage (via background),
// renders: mascot, hourly chart, session timeline, calendar,
// comparison cards, context facts, and share text.
//
// IMPORTANT: This file only READS from storage.
//            background.js is the sole writer.
// ============================================================

'use strict';

// State Section
let currentDateKey = todayKey();     // Which date is displayed right now
let chartInstance  = null;           // Chart.js instance (so we can destroy it on re-render)
let calYear        = new Date().getFullYear();
let calMonth       = new Date().getMonth(); // 0-indexed
let allStoredSummary = {};           // Mapping { "YYYY-MM-DD": totalCount }

// Helpers Section
/** Today's date string "YYYY-MM-DD" */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Format minutes to "Xh Ym" or "Ym" */
function fmtTime(mins) {
  if (mins < 1) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Format meters to "X.X m" or "X.XX km" */
function fmtDist(meters) {
  if (meters < 1)    return `${Math.round(meters * 100)} cm`;
  if (meters < 1000) return `${meters.toFixed(1)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

/** Format a Unix timestamp (ms) to "HH:MM" */
function fmtTime12(ts) {
  const d = new Date(ts);
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Format number with K/M suffix */
function fmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return Math.round(n / 1000) + 'K';
  return String(Math.round(n));
}

// Storage Readers Section
/** Load data for a specific date from background/storage */
async function loadDayData(dateKey) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_DAY', dateKey }, (res) => {
      if (res && res.ok) resolve(res.data);
      else resolve(null);
    });
  });
}

/** Load the list of all dates that have stored data */
async function loadAllDates() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_ALL_DATES' }, (res) => {
      resolve((res && res.ok) ? res.data : {});
    });
  });
}

// Hourly Data Binner Section
function binByHour(dayData) {
  const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, ig: 0, yt: 0, durationMins: 0 }));

  const igTimestamps = (dayData.instagram && dayData.instagram.reelTimestamps) || [];
  const ytTimestamps = (dayData.youtube   && dayData.youtube.reelTimestamps)   || [];
  const sessions     = (dayData.sessions) || [];

  // 1. First, place specific reel timestamps if we have them
  igTimestamps.forEach(ts => { 
    const h = new Date(ts).getHours(); 
    if (h >= 0 && h < 24) hours[h].ig++; 
  });
  ytTimestamps.forEach(ts => { 
    const h = new Date(ts).getHours(); 
    if (h >= 0 && h < 24) hours[h].yt++; 
  });

  // 2. Reconstruct missing data from sessions
  // We always fill durationMins from sessions.
  // We also fill reel counts if the session shows more reels than we have timestamps for.
  sessions.forEach(sess => {
    if (!sess.start || !sess.end) return;

    const startH    = new Date(sess.start).getHours();
    const endH      = new Date(sess.end).getHours();
    const totalMins = Math.max(0.1, (sess.end - sess.start) / 60000);

    // Build list of hours this session spans
    const hourRange = [];
    if (startH <= endH) {
      for (let h = startH; h <= endH; h++) hourRange.push(h);
    } else {
      for (let h = startH; h < 24; h++) hourRange.push(h);
      for (let h = 0; h <= endH; h++) hourRange.push(h);
    }
    const span = Math.max(1, hourRange.length);
    const sessReels = sess.reelCount || 0;

    hourRange.forEach(h => {
      if (h < 0 || h >= 24) return;

      // Supplement the hour with session data if the fine-grained timestamps are incomplete
      if (sess.platform === 'instagram' && igTimestamps.length < (dayData.instagram?.count || 0)) {
        hours[h].ig += (sessReels / span);
      }
      if (sess.platform === 'youtube' && ytTimestamps.length < (dayData.youtube?.count || 0)) {
        hours[h].yt += (sessReels / span);
      }

      // Always accumulate duration from sessions
      hours[h].durationMins += totalMins / span;
    });
  });

  // Round all values to integers
  hours.forEach(h => {
    h.ig = Math.round(h.ig);
    h.yt = Math.round(h.yt);
    h.durationMins = Math.round(h.durationMins);
  });

  return hours;
}

// Chart Renderer Section
// Hourly Graph Section
function renderChart(dayData) {
  const activeHours = binByHour(dayData);

  // Calculate totals for the summary text
  const totalIG   = activeHours.reduce((sum, h) => sum + h.ig, 0);
  const totalYT   = activeHours.reduce((sum, h) => sum + h.yt, 0);
  const totalMins = activeHours.reduce((sum, h) => sum + h.durationMins, 0);

  const chartEmpty   = document.getElementById('d-chart-empty');
  const chartWrap    = document.getElementById('d-chart-canvas-wrap');
  const chartSummary = document.getElementById('d-chart-summary');

  if (totalIG === 0 && totalYT === 0 && totalMins === 0) {
    chartWrap.style.display   = 'none';
    chartSummary.style.display = 'none';
    chartEmpty.style.display  = 'block';
    return;
  }

  document.getElementById('d-chart-summary-text').innerHTML = 
    `During these hours, you watched <b>${totalIG}</b> Instagram Reels and <b>${totalYT}</b> YouTube Shorts, totaling <b>${fmtTime(totalMins)}</b>.`;

  chartSummary.style.display = 'block';
  chartWrap.style.display    = 'block';
  chartEmpty.style.display   = 'none';

  // Format hour labels like "00-01", "01-02", ...
  const labels = activeHours.map(h => {
    const start = String(h.hour).padStart(2, '0');
    const end = String((h.hour + 1) % 24).padStart(2, '0');
    return `${start}-${end}`;
  });

  // Small delay to ensure the container is visible before the chart is built.
  setTimeout(() => {
    drawChart(activeHours, labels);
  }, 50);
}

function drawChart(activeHours, labels) {
  const wrap = document.getElementById('d-chart-canvas-wrap');
  wrap.innerHTML = '';

  const maxReels = Math.max(...activeHours.map(h => h.ig + h.yt), 1);
  const yAxisSteps = 4;
  const yStep = Math.ceil(maxReels / yAxisSteps);
  const chartHeight = Math.max(200, wrap.offsetHeight - 50);

  const chart = document.createElement('div');
  chart.id = 'd-custom-chart';

  const frame = document.createElement('div');
  frame.className = 'hourly-chart-frame';

  const yAxis = document.createElement('div');
  yAxis.className = 'hourly-chart-y-axis';
  for (let i = yAxisSteps; i >= 0; i--) {
    const label = document.createElement('div');
    label.className = 'hourly-chart-y-axis-label';
    label.textContent = String(i * yStep);
    yAxis.appendChild(label);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'hourly-chart-wrapper';

  const barsContainer = document.createElement('div');
  barsContainer.className = 'hourly-chart-bars-container';

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.innerHTML = `
    <div class="chart-tooltip-title">Hour 00-01</div>
    <div class="chart-tooltip-row"><span>Instagram</span><span>0 reels</span></div>
    <div class="chart-tooltip-row"><span>YouTube</span><span>0 shorts</span></div>
    <div class="chart-tooltip-row"><span>Time spent</span><span>0m</span></div>
  `;
  wrap.appendChild(tooltip);

  activeHours.forEach((h, index) => {
    const hourGroup = document.createElement('div');
    hourGroup.className = 'hourly-chart-hour-group';

    const barsSet = document.createElement('div');
    barsSet.className = 'hourly-chart-bars';

    const maxHeight = chartHeight - 10;
    const igHeightPx = h.ig > 0 ? Math.max(4, (h.ig / (yStep * yAxisSteps)) * maxHeight) : 0;
    const ytHeightPx = h.yt > 0 ? Math.max(4, (h.yt / (yStep * yAxisSteps)) * maxHeight) : 0;

    const igBar = document.createElement('div');
    igBar.className = 'hourly-chart-bar hourly-chart-bar--ig';
    igBar.style.height = `${igHeightPx}px`;
    igBar.dataset.reels = h.ig;
    igBar.dataset.platform = 'instagram';
    barsSet.appendChild(igBar);

    const ytBar = document.createElement('div');
    ytBar.className = 'hourly-chart-bar hourly-chart-bar--yt';
    ytBar.style.height = `${ytHeightPx}px`;
    ytBar.dataset.shorts = h.yt;
    ytBar.dataset.platform = 'youtube';
    barsSet.appendChild(ytBar);

    hourGroup.appendChild(barsSet);

    const hourLabel = document.createElement('div');
    hourLabel.className = 'hourly-chart-hour-label';
    hourLabel.textContent = labels[index];
    hourGroup.appendChild(hourLabel);

    // Only add hover event if there's actual data
    if (h.ig > 0 || h.yt > 0) {
      hourGroup.addEventListener('mouseenter', (e) => {
        const centerX = e.currentTarget.offsetLeft + e.currentTarget.offsetWidth / 2 + 48;
        tooltip.querySelector('.chart-tooltip-title').textContent = `Hour ${labels[index]}`;
        tooltip.querySelectorAll('.chart-tooltip-row')[0].querySelector('span:last-child').textContent = `${h.ig} reels`;
        tooltip.querySelectorAll('.chart-tooltip-row')[1].querySelector('span:last-child').textContent = `${h.yt} shorts`;
        tooltip.querySelectorAll('.chart-tooltip-row')[2].querySelector('span:last-child').textContent = fmtTime(h.durationMins);
        tooltip.style.left = `${centerX}px`;
        tooltip.style.top = `-10px`;
        tooltip.classList.add('visible');
      });

      hourGroup.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
      });
    }

    barsContainer.appendChild(hourGroup);
  });

  wrapper.appendChild(yAxis);
  wrapper.appendChild(barsContainer);
  chart.appendChild(wrapper);

  wrap.appendChild(chart);
}

// Session Timeline Renderer Section
// Session Timeline Section
function renderSessions(dayData) {
  const list    = document.getElementById('d-sessions-list');
  const emptyEl = document.getElementById('d-sessions-empty');
  const sessions = (dayData && dayData.sessions) ? dayData.sessions : [];

  if (sessions.length === 0) {
    list.innerHTML          = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  list.innerHTML = sessions.map(sess => {
    const color    = sess.platform === 'instagram' ? '#e1306c' : '#ff0000';
    const name     = sess.platform === 'instagram' ? 'Instagram Reels' : 'YouTube Shorts';
    const startFmt = fmtTime12(sess.start);
    const endFmt   = fmtTime12(sess.end);
    const durMins  = Math.round((sess.end - sess.start) / 60000);

    return `<div class="session-row">
      <div class="session-dot" style="background:${color};"></div>
      <div class="session-platform">${name}</div>
      <div class="session-time">${startFmt} – ${endFmt}</div>
      <div class="session-count">${sess.reelCount} reels</div>
      <div class="session-dur">${fmtTime(durMins)}</div>
    </div>`;
  }).join('');
}

// ── Dramatic copy per landmark (warning tone) ──────────────
const DASH_DRAMATIC = {
  book:      (d) => `Your thumb scrolled the height of a <span class="hl-red">📚 stack of books</span>. ${d} of your day — gone.`,
  human:     (d) => `You scrolled <span class="hl-red">🧍 a full human being's height</span> in reels. ${d}. Think about that.`,
  door:      (d) => `Your thumb reached <span class="hl-red">🚪 door height</span> today. ${d} of mindless scrolling.`,
  room:      (d) => `Your thumb scrolled the full height of a <span class="hl-red">🏠 room</span>. ${d}. Was it worth it?`,
  bus:       (d) => `You climbed a <span class="hl-red">🚌 double-decker bus</span> with your thumb. ${d} of shorts.`,
  building5: (d) => `<span class="hl-red">🏢 A 5-floor building.</span> That's how far your thumb scrolled. ${d}.`,
  cricket:   (d) => `The length of a <span class="hl-red">🏏 cricket pitch</span>. Your thumb scrolled it. ${d}.`,
  tree:      (d) => `Your thumb reached the top of a <span class="hl-red">🌴 tall tree</span>. ${d} of reels.`,
  building15:(d) => `<span class="hl-red">🏗️ 15 floors up.</span> That's your scroll distance today. ${d}.`,
  liberty:   (d) => `You out-scrolled <span class="hl-red">🗽 the Statue of Liberty</span>. ${d}. Seriously.`,
  football:  (d) => `A full <span class="hl-red">⛳ football field</span> of scrolling. ${d}. Go for a walk instead.`,
  eiffel:    (d) => `Your thumb conquered <span class="hl-red">🗼 the Eiffel Tower</span>. ${d}. This is not normal.`,
  burj:      (d) => `<span class="hl-red">🏙️ The Burj Khalifa.</span> Your thumb climbed it in reels. ${d}. Seek help.`,
  hill:      (d) => `You scrolled the height of <span class="hl-red">🏞️ a small hill</span>. ${d}. Unreal.`,
  everest:   (d) => `<span class="hl-red">🏔️ Mount Everest.</span> Your thumb summited it in reels. ${d}. How?`,
  flight:    (d) => `<span class="hl-red">✈️ Airplane altitude.</span> Your thumb is in the clouds. ${d}.`,
};

// Comparison Cards Renderer Section
function renderCompCards(totalReels) {
  const meters  = reelsToMeters(totalReels);
  const ctx     = getLandmarkContext(meters);
  const dist    = fmtDist(meters);
  const passed  = ctx.passed;
  const next    = ctx.next;

  // ── Left crime card ──────────────────────────────────────
  const target  = passed || next;
  const times   = passed ? Math.max(1, Math.floor(meters / passed.meters)) : 0;

  document.getElementById('d-crime-emoji').textContent    = target.emoji;
  document.getElementById('d-crime-lm-name').textContent  = target.name;
  document.getElementById('d-crime-lm-height').textContent = fmtDist(target.meters) + ' tall';

  const stamp = document.getElementById('d-crime-stamp');
  if (passed) {
    stamp.textContent = 'Exceeded';
    stamp.className   = '';
    document.getElementById('d-crime-count').textContent   = times + '×';
    document.getElementById('d-crime-count-unit').innerHTML = 'you scrolled<br>this height';
    // Stack emojis up to 8
    const stackCount = Math.min(times, 8);
    document.getElementById('d-crime-stack').innerHTML = Array.from({ length: stackCount })
      .map(() => `<span class="crime-stack-em">${passed.emoji}</span>`).join('');
  } else {
    stamp.textContent = 'Warning';
    stamp.className   = 'warn';
    document.getElementById('d-crime-count').textContent    = '0×';
    document.getElementById('d-crime-count-unit').innerHTML = 'not yet exceeded<br>but approaching';
    document.getElementById('d-crime-stack').innerHTML =
      `<span class="crime-stack-em faded">${next.emoji}</span>`;
  }

  // ── Right: dramatic + warning ────────────────────────────
  const dramaticEl = document.getElementById('d-crime-dramatic');
  if (totalReels === 0) {
    dramaticEl.innerHTML = `Your thumb hasn't scrolled yet today. <span class="hl-amber">Keep it that way.</span>`;
  } else if (passed && DASH_DRAMATIC[passed.id]) {
    dramaticEl.innerHTML = DASH_DRAMATIC[passed.id](dist);
  } else {
    dramaticEl.innerHTML = `Your thumb has scrolled <span class="hl-amber">${dist}</span> — approaching the ${next.emoji} ${next.name}.`;
  }

  document.getElementById('d-crime-sub').textContent =
    `${dist} scrolled today · ${totalReels} reels × 15 cm each`;

  const rem    = fmtDist(Math.max(0, next.meters - meters));
  const warnEl = document.getElementById('d-crime-next-warn');
  if (passed) {
    warnEl.className   = '';
    warnEl.textContent = `⚠ Only ${rem} until you exceed the ${next.emoji} ${next.name}. Stop now.`;
  } else {
    warnEl.className   = 'amber-warn';
    warnEl.textContent = `${rem} away from your first threshold — the ${next.emoji} ${next.name}.`;
  }

  // ── Secondary scroll row ─────────────────────────────────
  const scroll = document.getElementById('d-comp-scroll');
  scroll.innerHTML = LANDMARKS.map(lm => {
    const pct      = Math.min(100, (meters / lm.meters) * 100);
    const exceeded = meters >= lm.meters;
    const isNext   = next && next.id === lm.id;
    const cls      = exceeded ? 'exceeded' : isNext ? 'approaching' : 'locked';
    const tag      = exceeded ? '⚠ Exceeded' : isNext ? '▲ Approaching' : 'Locked';
    return `<div class="d-comp-card d-comp-card--${cls}">
      <div class="d-comp-card__emoji">${lm.emoji}</div>
      <div class="d-comp-card__label">${tag}</div>
      <div class="d-comp-card__name">${lm.name}</div>
      <div class="d-comp-card__bar">
        <div class="d-comp-card__fill" style="width:${Math.max(pct > 0 ? 3 : 0, pct).toFixed(1)}%"></div>
      </div>
      <div class="d-comp-card__pct">${pct >= 100 ? '100%' : pct.toFixed(1) + '%'} of ${fmtDist(lm.meters)}</div>
    </div>`;
  }).join('');

  const approaching = scroll.querySelector('.d-comp-card--approaching');
  if (approaching) {
    setTimeout(() => approaching.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 150);
  }
}

// ─────────────────────────────────────────────────────────────
// Context Facts Renderer Section
// ─────────────────────────────────────────────────────────────
const FACT_DEFS = [
  { icon: '👥', label: 'People born while you scrolled',       per60s: 2.5     },
  { icon: '⚡', label: 'Lightning bolts while you scrolled',   per60s: 360     },
  { icon: '📷', label: 'Photos uploaded while you scrolled',   per60s: 65000   },
  { icon: '🐦', label: 'Tweets posted while you scrolled',     per60s: 2800    },
  { icon: '🎬', label: 'YT hours added while you scrolled',    per60s: 500     },
  { icon: '❤️', label: 'Heartbeats while you scrolled',        per60s: 1000000 },
];

function fmtFactNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return String(Math.round(n));
}

function renderContextFacts(totalReels) {
  const wrap     = document.getElementById('d-context-wrap');
  const totalMins = Math.max(1, totalReels); // 1 min per reel fallback

  if (totalReels === 0) {
    wrap.innerHTML = `<div style="grid-column:1/-1;font-size:13px;color:var(--text-secondary);padding:8px 0;">No scrolling recorded yet today.</div>`;
    return;
  }

  wrap.innerHTML = FACT_DEFS.map(f => {
    const n = f.per60s * totalMins;
    return `<div class="fact-card">
      <div class="fact-card__icon">${f.icon}</div>
      <div class="fact-card__num">${fmtFactNum(n)}</div>
      <div class="fact-card__text">${f.label}</div>
    </div>`;
  }).join('');
}

// Mascot Renderer Section
// Mascot Section
function renderSideMascot(totalReels, distStr) {
  const expression = getMascotExpression(totalReels);    // from mascot.js
  const color      = getMascotColor(expression);         // from mascot.js
  const quote      = getMascotQuote(expression, { total: totalReels }, { distStr }); // from mascot.js

  // Draw mascot SVG
  renderMascot(document.getElementById('side-mascot-wrap'), expression, 90);

  // Update mood pill
  const pill = document.getElementById('side-mood-pill');
  pill.textContent = expression.charAt(0).toUpperCase() + expression.slice(1);
  pill.style.color       = color;
  pill.style.background  = color + '18';
  pill.style.borderColor = color + '40';

  // Update message
  document.getElementById('side-mascot-msg').textContent = `"${quote}"`;
}

// Header Stats Renderer Section
// Header Stats Section
function renderHeader(dayData) {
  const igCount = dayData.instagram ? dayData.instagram.count : 0;
  const ytCount = dayData.youtube   ? dayData.youtube.count   : 0;
  const total   = igCount + ytCount;
  const meters  = reelsToMeters(total);
  const distStr = fmtDist(meters);
  const ctx     = getLandmarkContext(meters);
  const comp    = getComparisonHeadline(total);

  // Big reel number at the top
  document.getElementById('d-total-reels').textContent = total;
  document.getElementById('d-dist-text').textContent   = distStr;
  document.getElementById('d-comp-text').textContent   = comp.headline.replace(/^"|"$/g, '');

  // Calculate actual time lost from sessions, fallback to 1min/reel if sessions are empty
  const actualMins = (dayData.sessions || []).reduce((acc, s) => {
    return acc + Math.round((s.end - s.start) / 60000);
  }, 0);

  // Progress ring: % toward the NEXT landmark
  const pctNext  = ctx.pctOfNext;
  const circum   = 188.5; // 2π × 30
  const offset   = circum - (pctNext / 100) * circum;
  const arc      = document.getElementById('d-ring-arc');
  arc.setAttribute('stroke-dashoffset', offset.toFixed(1));

  // Ring color changes with mood
  const expression = getMascotExpression(total);
  const moodColor  = getMascotColor(expression);
  arc.setAttribute('stroke', moodColor);

  document.getElementById('d-ring-pct').textContent = `${Math.round(pctNext)}%`;

  // Mood badge next to ring
  const badge = document.getElementById('d-mood-badge');
  badge.textContent   = expression.charAt(0).toUpperCase() + expression.slice(1);
  badge.style.color   = moodColor;
  badge.style.background  = moodColor + '18';
  badge.style.borderColor = moodColor + '40';

  // Stat chips
  document.getElementById('d-stat-dist').textContent  = distStr;
  document.getElementById('d-stat-dist').style.color  = moodColor;
  document.getElementById('d-stat-time').textContent  = fmtTime(actualMins || total);
  document.getElementById('d-stat-total').textContent = total;
  document.getElementById('d-stat-split').textContent = `IG ${igCount} · YT ${ytCount}`;
}

// Platform Breakdown Renderer Section
// Platform Breakdown Section
function renderPlatformBreakdown(dayData) {
  const ig    = dayData.instagram ? dayData.instagram.count : 0;
  const yt    = dayData.youtube   ? dayData.youtube.count   : 0;
  const total = ig + yt;

  const igPct = total > 0 ? Math.round((ig / total) * 100) : 0;
  const ytPct = total > 0 ? 100 - igPct : 0;

  document.getElementById('pb-ig-count').textContent = `${ig} reels`;
  document.getElementById('pb-yt-count').textContent = `${yt} shorts`;
  document.getElementById('pb-ig-bar').style.width   = `${igPct}%`;
  document.getElementById('pb-yt-bar').style.width   = `${ytPct}%`;
  document.getElementById('pb-ig-dist').textContent  = fmtDist(reelsToMeters(ig));
  document.getElementById('pb-yt-dist').textContent  = fmtDist(reelsToMeters(yt));
  document.getElementById('pb-ig-time').textContent  = fmtTime(ig);
  document.getElementById('pb-yt-time').textContent  = fmtTime(yt);
}

// Share Text Generator Section
// Share Text Section
function renderShareText(totalReels) {
  const meters = reelsToMeters(totalReels);
  const ctx    = getLandmarkContext(meters);
  const distStr = fmtDist(meters);
  const dateLabel = currentDateKey === todayKey() ? 'today' : `on ${currentDateKey}`;

  let msg = '';
  if (totalReels === 0) {
    msg = 'Zero reels tracked. Clean day. 🧘';
  } else if (ctx.passed) {
    msg = `I scrolled ${distStr} ${dateLabel} — past ${ctx.passed.emoji} ${ctx.passed.name}. That's ${totalReels} reels.`;
  } else {
    msg = `I scrolled ${distStr} ${dateLabel}. That's ${totalReels} reels and ${fmtTime(totalReels)} of my life. 💀`;
  }

  document.getElementById('d-share-text').textContent = msg;

  // Copy to clipboard on share button click
  document.getElementById('d-share-btn').onclick = () => {
    navigator.clipboard.writeText(msg + ' — FocusGuard Insights').then(() => {
      const btn = document.getElementById('d-share-btn');
      btn.textContent = 'Copied! ✅';
      setTimeout(() => { btn.textContent = 'Share damage 💀'; }, 2500);
    });
  };
}

// Empty State Handler Section
// Empty State Section
function setEmptyState(isEmpty) {
  document.getElementById('d-empty-state').style.display = isEmpty ? 'flex' : 'none';
  document.getElementById('d-data-sections').style.display = isEmpty ? 'none' : 'block';
}

// Calendar Builder Section
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// Calendar Section
function buildCalendar() {
  const fullLabel = document.getElementById('full-cal-month');
  const sideLabel = document.getElementById('side-cal-month');
  const labelStr = `${MONTHS[calMonth]} ${calYear}`;
  if (fullLabel) fullLabel.textContent = labelStr;
  if (sideLabel) sideLabel.textContent = labelStr;

  // Find first day of month (aligning Mon=0 to Sun=6)
  let first = new Date(calYear, calMonth, 1).getDay();
  first = (first + 6) % 7; 

  const daysInMo  = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr  = todayKey();

  // Add Day-of-Week headers
  const DOW = ['M','T','W','T','F','S','S'];
  let html = DOW.map(d => `<div class="cal-dow">${d}</div>`).join('');

  // Previous month padding
  for (let i = 0; i < first; i++) {
    html += `<div class="cal-cell other-month"></div>`;
  }

  // This month's days
  for (let d = 1; d <= daysInMo; d++) {
    const key     = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = key === todayStr;
    const isSel   = key === currentDateKey;
    const count   = allStoredSummary[key] || 0;

    let intensity = '';
    if (count > 0) {
      if (count < 20)  intensity = 'low';
      else if (count < 60) intensity = 'mid';
      else if (count < 150) intensity = 'high';
      else intensity = 'extreme';
    }

    const classes = ['cal-cell', isToday ? 'today' : '', isSel ? 'selected' : '', intensity]
      .filter(Boolean).join(' ');

    html += `<div class="${classes}" data-key="${key}">
      <div class="cal-day-num">${d}</div>
      ${count > 0 ? `<div class="cal-pip"></div>` : ''}
      ${count > 0 ? `<div class="cal-cell-count">${count} r</div>` : ''}
    </div>`;
  }

  const grid = document.getElementById('cal-grid');
  const sideGrid = document.getElementById('side-cal-grid');
  if (grid) grid.innerHTML = html;
  if (sideGrid) sideGrid.innerHTML = html;

  // Attach click handlers to each cell
  document.querySelectorAll('.cal-cell[data-key]').forEach(cell => {
    cell.addEventListener('click', () => {
      const key = cell.dataset.key;
      if (key > todayStr) return;
      currentDateKey = key;
      switchView('today');
      loadAndRender(key);
    });
  });
}

/** Toggles between Summary (Today) and Calendar Archive */
function switchView(viewName) {
  const todayV   = document.getElementById('view-today');
  const archiveV = document.getElementById('view-archive');
  if (viewName === 'archive') {
    todayV.style.display   = 'none';
    archiveV.style.display = 'block';
  } else {
    todayV.style.display   = 'block';
    archiveV.style.display = 'none';
  }
}

// Master Render Function Section
// Main Render Section
async function loadAndRender(dateKey) {
  // Always switch to the today/data view (not archive)
  switchView('today');

  // Update the date badge in the nav bar
  const badge = document.getElementById('d-date-badge');
  badge.textContent = dateKey === todayKey() ? 'Today' : dateKey;

  // Refresh stored summary so calendar heatmap is always current
  allStoredSummary = await loadAllDates();

  // Fetch data
  const rawData = await loadDayData(dateKey);
  const dayData = rawData || { instagram: { count: 0, reelTimestamps: [] }, youtube: { count: 0, reelTimestamps: [] }, sessions: [] };

  // ── SELF-HEAL: reconstruct counts from sessions when SW missed REEL_COUNTED ──
  // This is the main fix for "sessions show reels but count = 0"
  if (!dayData.instagram) dayData.instagram = { count: 0, reelTimestamps: [] };
  if (!dayData.youtube)   dayData.youtube   = { count: 0, reelTimestamps: [] };
  if (!dayData.sessions)  dayData.sessions  = [];

  const sessIG = dayData.sessions
    .filter(s => s.platform === 'instagram')
    .reduce((sum, s) => sum + (s.reelCount || 0), 0);
  const sessYT = dayData.sessions
    .filter(s => s.platform === 'youtube')
    .reduce((sum, s) => sum + (s.reelCount || 0), 0);
  if (sessIG > dayData.instagram.count) dayData.instagram.count = sessIG;
  if (sessYT > dayData.youtube.count)   dayData.youtube.count   = sessYT;
  // ── END SELF-HEAL ──

  // Recalculate these AFTER the self-heal logic above
  const finalIG    = dayData.instagram.count;
  const finalYT    = dayData.youtube.count;
  const total      = finalIG + finalYT;
  const sessCount  = dayData.sessions.length;

  // Show data sections if there are reels OR sessions recorded
  const hasData    = total > 0 || sessCount > 0;

  setEmptyState(!hasData);
  const distStr = fmtDist(reelsToMeters(total));

  renderHeader(dayData);
  renderSideMascot(total, distStr);
  renderPlatformBreakdown(dayData);
  renderChart(dayData);
  renderSessions(dayData);
  renderCompCards(total);
  renderContextFacts(total);
  renderShareText(total);
  buildCalendar();
}

// Calendar Navigation Buttons Section
// Calendar Navigation Section
function initCalendarNav() {
  const prevHandlers = ['cal-prev-btn', 'side-cal-prev'];
  const nextHandlers = ['cal-next-btn', 'side-cal-next'];

  prevHandlers.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.onclick = (e) => {
      e.stopPropagation();
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      buildCalendar();
    };
  });

  nextHandlers.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.onclick = (e) => {
      e.stopPropagation();
      const now = new Date();
      if (calYear === now.getFullYear() && calMonth >= now.getMonth()) return;
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      buildCalendar();
    };
  });
}

// ─────────────────────────────────────────────────────────────
// SECTION 17: Init — entry point called when DOM is ready
// ─────────────────────────────────────────────────────────────

// Initialization Section
async function init() {
  // 1. Immediately show the today view (never start on archive)
  switchView('today');

  // 2. Load all stored summary data for calendar heatmap
  allStoredSummary = await loadAllDates();

  // 3. Set up calendar nav button listeners
  initCalendarNav();
  document.getElementById('d-date-badge').onclick = () => switchView('archive');
  
  document.getElementById('side-mascot-card').onclick = () => {
    currentDateKey = todayKey();
    loadAndRender(currentDateKey);
  };

  // 4. Build the initial calendar view
  buildCalendar();

  // 5. Load and render today's data by default
  await loadAndRender(currentDateKey);

  // 6. Refresh data every 30 seconds while the dashboard is open
  setInterval(async () => {
    if (currentDateKey === todayKey()) {
      allStoredSummary = await loadAllDates();
      await loadAndRender(currentDateKey);
    }
  }, 30000);
}

// ─────────────────────────────────────────────────────────────
// SECTION 18: Kick off when DOM is ready
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);