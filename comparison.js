// ============================================================
// FocusGuard Insights — comparison.js
// Converts reel count → distance → real-world comparisons.
// Used by both popup.js and dashboard.js.
// ============================================================

'use strict';

const REEL_HEIGHT_M = 0.15; // 1 reel = 15 cm = 0.15 m

// ── Landmark database ───────────────────────────────────────
// Each entry: { id, name, meters, emoji, level, tone, svgFn }
const LANDMARKS = [
  { id:'book',    name:'Book stack',         meters: 1.5,   emoji:'📚', level:1 },
  { id:'human',   name:'Human height',       meters: 1.7,   emoji:'🧍', level:1 },
  { id:'door',    name:'Door',               meters: 2.1,   emoji:'🚪', level:1 },
  { id:'room',    name:'Room height',        meters: 3.0,   emoji:'🏠', level:1 },
  { id:'bus',     name:'Double-decker bus',  meters: 4.4,   emoji:'🚌', level:1 },
  { id:'building5',name:'5-floor building',  meters: 15,    emoji:'🏢', level:2 },
  { id:'cricket', name:'Cricket pitch',      meters: 20,    emoji:'🏏', level:2 },
  { id:'tree',    name:'Tall tree',          meters: 28,    emoji:'🌴', level:2 },
  { id:'building15',name:'15-floor building',meters: 50,    emoji:'🏗️', level:3 },
  { id:'liberty', name:'Statue of Liberty',  meters: 93,    emoji:'🗽', level:3 },
  { id:'football',name:'Football field',     meters: 100,   emoji:'⛳', level:3 },
  { id:'eiffel',  name:'Eiffel Tower',       meters: 330,   emoji:'🗼', level:4 },
  { id:'burj',    name:'Burj Khalifa',       meters: 828,   emoji:'🏙️', level:5 },
  { id:'hill',    name:'Small hill',         meters: 1000,  emoji:'🏞️', level:5 },
  { id:'everest', name:'Mount Everest',      meters: 8848,  emoji:'🏔️', level:6 },
  { id:'flight',  name:'Airplane altitude',  meters: 10000, emoji:'✈️', level:6 },
];

const LEVEL_TONES = {
  1: "You're starting to drift…",
  2: "This is getting serious…",
  3: "You've gone too far today.",
  4: "This is not normal anymore.",
  5: "This is addiction territory.",
  6: "How?! Seek help. Seriously.",
};

// ── Core math ───────────────────────────────────────────────

function reelsToMeters (count) {
  return count * REEL_HEIGHT_M;
}

function formatDistance (meters) {
  if (meters < 1)     return `${Math.round(meters * 100)} cm`;
  if (meters < 1000)  return `${meters.toFixed(1)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

// ── Landmark lookup ─────────────────────────────────────────

/**
 * Returns { passed, next, pctOfNext } for a given distance in meters.
 * passed = the highest landmark the user has already exceeded (or null)
 * next   = the next landmark they're approaching
 */
function getLandmarkContext (meters) {
  let passed = null;
  let next   = LANDMARKS[0];

  for (let i = 0; i < LANDMARKS.length; i++) {
    if (meters >= LANDMARKS[i].meters) {
      passed = LANDMARKS[i];
      next   = LANDMARKS[i + 1] || LANDMARKS[LANDMARKS.length - 1];
    } else {
      next = LANDMARKS[i];
      break;
    }
  }

  const remaining  = next.meters - meters;
  const pctOfNext  = Math.min(100, (meters / next.meters) * 100);
  const level      = passed ? passed.level : 1;
  const tone       = LEVEL_TONES[level] || LEVEL_TONES[1];

  return { passed, next, remaining, pctOfNext, level, tone };
}

/**
 * Headline sentence for popup comparison card.
 * Shows BOTH passed + approaching.
 */
function getComparisonHeadline (totalReels) {
  const meters = reelsToMeters(totalReels);
  const ctx    = getLandmarkContext(meters);
  const dist   = formatDistance(meters);

  if (!ctx.passed) {
    return {
      headline : `Your thumb has scrolled ${dist} today.`,
      sub      : `${formatDistance(ctx.next.meters - meters)} away from ${ctx.next.emoji} ${ctx.next.name}.`,
      tone     : LEVEL_TONES[1],
    };
  }

  const remFmt = formatDistance(ctx.remaining);
  return {
    headline : `"Today your thumb scrolled past ${ctx.passed.emoji} ${ctx.passed.name}."`,
    sub      : `${remFmt} to go before you reach ${ctx.next.emoji} ${ctx.next.name}.`,
    tone     : ctx.tone,
  };
}

// ── SVG illustrations ────────────────────────────────────────
// Each returns an SVG string sized to fit the card.

function getSvgForLandmark (landmarkId, fillPct = 50, width = 300, height = 80) {
  const W = width, H = height;
  const fillW = Math.max(4, Math.round((fillPct / 100) * (W - 20)));
  const c = '#4f8ef7'; // blue fill

  switch (landmarkId) {

    case 'football': case 'cricket': case 'liberty': {
      // Horizontal field / pitch diagram
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" style="border-radius:8px;">
        <rect width="${W}" height="${H}" rx="6" fill="#0d1a0d"/>
        <rect x="0" y="0" width="${W}" height="${H}" rx="6" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width=".8"/>
        <!-- field lines -->
        <line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" stroke="rgba(255,255,255,0.06)" stroke-width=".5"/>
        <rect x="10" y="8" width="${W-20}" height="${H-16}" rx="4" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width=".7"/>
        <line x1="${W/2}" y1="8" x2="${W/2}" y2="${H-8}" stroke="rgba(255,255,255,0.12)" stroke-width=".7"/>
        <circle cx="${W/2}" cy="${H/2}" r="${H*.18}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width=".7"/>
        <!-- user progress -->
        <rect x="10" y="8" width="${fillW}" height="${H-16}" rx="4" fill="rgba(79,142,247,0.35)"/>
        <line x1="${10+fillW}" y1="8" x2="${10+fillW}" y2="${H-8}" stroke="${c}" stroke-width="1.5" style="filter:drop-shadow(0 0 4px ${c})"/>
        <!-- label -->
        <text x="${10+fillW+4}" y="${H/2+4}" font-size="9" fill="${c}" font-family="JetBrains Mono,monospace">you</text>
        <text x="${W-10}" y="${H/2+4}" font-size="9" fill="rgba(255,255,255,0.3)" font-family="JetBrains Mono,monospace" text-anchor="end">100%</text>
      </svg>`;
    }

    case 'eiffel': {
      // Eiffel tower silhouette with fill
      const tH = H - 8;
      const base = H - 4;
      const tip  = 4;
      const tCX  = W * 0.72;
      const tW   = W * 0.22;
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" style="border-radius:8px;">
        <rect width="${W}" height="${H}" rx="6" fill="#0d0d1a"/>
        <!-- progress bar left side -->
        <rect x="8" y="8" width="${fillW}" height="${H-16}" rx="3" fill="rgba(79,142,247,0.3)"/>
        <rect x="8" y="8" width="${fillW}" height="${H-16}" rx="3" fill="none" stroke="${c}" stroke-width=".8" opacity=".5"/>
        <text x="${8+fillW+3}" y="${H/2+4}" font-size="9" fill="${c}" font-family="JetBrains Mono,monospace">you</text>
        <!-- eiffel silhouette -->
        <polygon points="${tCX},${tip} ${tCX-tW*.12},${tH*.28} ${tCX+tW*.12},${tH*.28}" fill="#7F77DD" opacity=".8"/>
        <polygon points="${tCX-tW*.12},${tH*.28} ${tCX-tW*.3},${tH*.65} ${tCX+tW*.3},${tH*.65} ${tCX+tW*.12},${tH*.28}" fill="#7F77DD" opacity=".8"/>
        <rect x="${tCX-tW*.35}" y="${tH*.65}" width="${tW*.7}" height="${tH*.08}" rx="1" fill="#534AB7" opacity=".8"/>
        <polygon points="${tCX-tW*.3},${tH*.73} ${tCX-tW*.5},${base} ${tCX-tW*.12},${base}" fill="#7F77DD" opacity=".7"/>
        <polygon points="${tCX+tW*.3},${tH*.73} ${tCX+tW*.5},${base} ${tCX+tW*.12},${base}" fill="#7F77DD" opacity=".7"/>
        <rect x="${tCX-tW*.55}" y="${base}" width="${tW*1.1}" height="3" rx="1" fill="#534AB7" opacity=".8"/>
      </svg>`;
    }

    case 'burj': {
      const bCX = W * 0.74;
      const bW  = W * 0.14;
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" style="border-radius:8px;">
        <rect width="${W}" height="${H}" rx="6" fill="#0d0d1a"/>
        <rect x="8" y="8" width="${fillW}" height="${H-16}" rx="3" fill="rgba(79,142,247,0.3)"/>
        <text x="${8+fillW+3}" y="${H/2+4}" font-size="9" fill="${c}" font-family="JetBrains Mono,monospace">you</text>
        <!-- burj -->
        <polygon points="${bCX},4 ${bCX-bW*.3},${H*.3} ${bCX+bW*.3},${H*.3}" fill="#85B7EB" opacity=".8"/>
        <rect x="${bCX-bW*.3}" y="${H*.3}" width="${bW*.6}" height="${H*.15}" rx="1" fill="#378ADD" opacity=".8"/>
        <rect x="${bCX-bW*.45}" y="${H*.45}" width="${bW*.9}" height="${H*.2}" rx="1" fill="#185FA5" opacity=".8"/>
        <rect x="${bCX-bW*.55}" y="${H*.65}" width="${bW*1.1}" height="${H*.28}" rx="2" fill="#0C447C" opacity=".9"/>
        <rect x="${bCX-bW*.6}" y="${H*.93}" width="${bW*1.2}" height="3" rx="1" fill="#042C53"/>
      </svg>`;
    }

    case 'everest': {
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" style="border-radius:8px;">
        <rect width="${W}" height="${H}" rx="6" fill="#0d0d1a"/>
        <rect x="8" y="8" width="${fillW}" height="${H-16}" rx="3" fill="rgba(79,142,247,0.3)"/>
        <text x="${8+fillW+3}" y="${H/2+4}" font-size="9" fill="${c}" font-family="JetBrains Mono,monospace">you</text>
        <polygon points="${W*.7},6 ${W*.5},${H-6} ${W*.9},${H-6}" fill="#B4B2A9" opacity=".8"/>
        <polygon points="${W*.7},6 ${W*.58},${H*.42} ${W*.82},${H*.42}" fill="#D3D1C7" opacity=".8"/>
        <polygon points="${W*.7},6 ${W*.64},${H*.25} ${W*.76},${H*.25}" fill="white" opacity=".25"/>
        <rect x="${W*.48}" y="${H-8}" width="${W*.44}" height="4" rx="1" fill="#888780" opacity=".7"/>
      </svg>`;
    }

    default: {
      // Generic horizontal bar
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" style="border-radius:8px;">
        <rect width="${W}" height="${H}" rx="6" fill="#0d1a14"/>
        <rect x="8" y="${H/2-8}" width="${W-16}" height="16" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width=".7"/>
        <rect x="8" y="${H/2-8}" width="${fillW}" height="16" rx="4" fill="rgba(79,142,247,0.4)" style="filter:drop-shadow(0 0 6px rgba(79,142,247,.5))"/>
        <text x="${8+fillW+4}" y="${H/2+4}" font-size="9" fill="${c}" font-family="JetBrains Mono,monospace">you</text>
      </svg>`;
    }
  }
}

/**
 * Best SVG to show for current distance.
 * Returns { svgHtml, fillPct, landmark }
 */
function getComparisonSvg (totalReels, width = 290, height = 80) {
  const meters  = reelsToMeters(totalReels);
  const ctx     = getLandmarkContext(meters);
  const target  = ctx.next; // show progress toward the next one
  const fillPct = ctx.pctOfNext;

  const svgHtml = getSvgForLandmark(target.id, fillPct, width, height);
  return { svgHtml, fillPct, landmark: target };
}

// ── Context facts (what happened while you scrolled) ────────

const CONTEXT_FACTS = [
  { per60s: 2.5,        unit: 'people',        text: 'The world population grew by {n} people.' },
  { per60s: 360,        unit: 'bolts',          text: '{n} lightning bolts struck Earth.' },
  { per60s: 65000,      unit: 'photos',         text: '{n} photos were uploaded to Instagram.' },
  { per60s: 1000000,    unit: 'heartbeats',     text: 'Humans took {n} collective heartbeats.' },
  { per60s: 2800,       unit: 'tweets',         text: '{n} tweets were posted on X (Twitter).' },
  { per60s: 500,        unit: 'hours',          text: '{n} hours of video were uploaded to YouTube.' },
];

function getContextFacts (totalMinutes) {
  return CONTEXT_FACTS.map(f => {
    const n = Math.round(f.per60s * totalMinutes);
    const fmt = n >= 1000000
      ? (n / 1000000).toFixed(1) + 'M'
      : n >= 1000
        ? (n / 1000).toFixed(0) + 'K'
        : String(n);
    return f.text.replace('{n}', fmt);
  });
}