// ============================================================
// FocusGuard Insights — mascot.js
// Shared mascot rendering engine.
// Call renderMascot(containerId, expression) to draw.
// ============================================================

'use strict';

// ── Expression definitions ──────────────────────────────────
const MASCOT_EXPRESSIONS = {
  happy: {
    label : 'Happy',
    color : '#22c55e',
    anim  : 'mascot-bob-fast 1.8s ease-in-out infinite',
    quote : (d,c) => `Clean day! ${d.total} reels — just ${c.distStr} scrolled. Keep it up!`,
    build : (S, cx, scCX, scCY) => ({
      eyeL  : ovalEye(scCX-S*.09, scCY-S*.04, S*.1, S*.11),
      eyeR  : winkEye(scCX+S*.09, scCY-S*.04, S*.1),
      mouth : smileMouth(scCX, scCY+S*.08, S*.18, S*.07),
      extras: sparkleExtras(S, scCX, scCY),
    })
  },
  satisfied: {
    label : 'Satisfied',
    color : '#22c55e',
    anim  : 'mascot-bob-slow 3s ease-in-out infinite',
    quote : (d,c) => `${d.total} reels today — that's ${c.distStr}. Things look manageable.`,
    build : (S, cx, scCX, scCY) => ({
      eyeL  : halfEye(scCX-S*.09, scCY-S*.03, S*.1, S*.1),
      eyeR  : halfEye(scCX+S*.09, scCY-S*.03, S*.1, S*.1),
      mouth : smileMouth(scCX, scCY+S*.07, S*.15, S*.05),
      extras: '',
    })
  },
  calm: {
    label : 'Calm',
    color : '#4f8ef7',
    anim  : 'mascot-bob-slow 3.8s ease-in-out infinite',
    quote : (d,c) => `${d.total} reels — ${c.distStr} today. Balanced so far. Stay present.`,
    build : (S, cx, scCX, scCY) => ({
      eyeL  : ovalEye(scCX-S*.09, scCY-S*.04, S*.1, S*.12),
      eyeR  : ovalEye(scCX+S*.09, scCY-S*.04, S*.1, S*.12),
      mouth : smileMouth(scCX, scCY+S*.07, S*.14, S*.045),
      extras: '',
    })
  },
  curious: {
    label : 'Curious',
    color : '#4f8ef7',
    anim  : 'mascot-bob 2.2s ease-in-out infinite',
    quote : (d,c) => `${d.total} reels… ${c.distStr} scrolled. I'm noticing a pattern forming here.`,
    build : (S, cx, scCX, scCY) => ({
      eyeL  : ovalEye(scCX-S*.09, scCY-S*.04, S*.1, S*.12),
      eyeR  : ovalEye(scCX+S*.09, scCY-S*.04, S*.1, S*.12),
      mouth : flatMouth(scCX, scCY+S*.08, S*.1),
      extras: questionExtra(S, scCX, scCY),
    })
  },
  concerned: {
    label : 'Concerned',
    color : '#f59e0b',
    anim  : 'mascot-bob-slow 3s ease-in-out infinite',
    quote : (d,c) => `${d.total} reels — that's ${c.distStr}. You've been at this a while. Are you okay?`,
    build : (S, cx, scCX, scCY) => ({
      eyeL  : ovalEye(scCX-S*.09, scCY-S*.04, S*.1, S*.12, '#f59e0b', 'glow-pulse 2s ease-in-out infinite'),
      eyeR  : ovalEye(scCX+S*.09, scCY-S*.04, S*.1, S*.12, '#f59e0b', 'glow-pulse 2s ease-in-out infinite .3s'),
      mouth : frownMouth(scCX, scCY+S*.09, S*.14, S*.055, '#f59e0b'),
      extras: sweatExtra(S, scCX, scCY),
    })
  },
  anger: {
    label : 'Slight Anger',
    color : '#ef4444',
    anim  : 'mascot-bob-slow 2.8s ease-in-out infinite',
    quote : (d,c) => `${d.total} reels! That's ${c.distStr}. This is getting out of hand. I'm not happy.`,
    build : (S, cx, scCX, scCY) => ({
      eyeL  : angryEye(scCX-S*.09, scCY-S*.03, S*.1, S*.1, '#ef4444'),
      eyeR  : angryEye(scCX+S*.09, scCY-S*.03, S*.1, S*.1, '#ef4444'),
      mouth : frownMouth(scCX, scCY+S*.09, S*.16, S*.065, '#ef4444'),
      extras: angerExtras(S, scCX, scCY),
    })
  },
  destroyer: {
    label : 'World Destroyer',
    color : '#ef4444',
    anim  : 'mascot-shake 2.4s ease-in-out infinite',
    quote : (d,c) => `${d.total} REELS?! That's ${c.distStr}. WHAT ARE YOU DOING. THIS IS A CRISIS. STOP.`,
    build : (S, cx, scCX, scCY) => ({
      eyeL  : angryEye(scCX-S*.09, scCY-S*.03, S*.1, S*.1, '#ff2244'),
      eyeR  : angryEye(scCX+S*.09, scCY-S*.03, S*.1, S*.1, '#ff2244'),
      mouth : rageMouth(scCX, scCY+S*.06, S*.2, S*.09),
      extras: destroyerExtras(S, scCX, scCY),
    })
  },
};

// ── Expression selector by total reels (volume only, V1) ────
function getExpression (totalReels) {
  if (totalReels === 0)   return 'calm';
  if (totalReels <= 10)   return 'happy';
  if (totalReels <= 20)   return 'satisfied';
  if (totalReels <= 40)   return 'calm';
  if (totalReels <= 60)   return 'curious';
  if (totalReels <= 100)  return 'concerned';
  if (totalReels <= 150)  return 'anger';
  return 'destroyer';
}

// ── SVG face parts ──────────────────────────────────────────

function ovalEye (x, y, w, h, color='#00e070', anim='') {
  return `<g style="filter:drop-shadow(0 0 5px ${color}) drop-shadow(0 0 10px ${color}50);${anim?'animation:'+anim:''}">
    <ellipse cx="${x}" cy="${y}" rx="${w/2}" ry="${h/2}" fill="${color}" opacity=".95"/>
    <ellipse cx="${x-w*.12}" cy="${y-h*.18}" rx="${w*.18}" ry="${h*.18}" fill="rgba(255,255,255,0.5)"/>
  </g>`;
}

function halfEye (x, y, w, h, color='#00e070') {
  return `<g style="filter:drop-shadow(0 0 5px ${color})">
    <ellipse cx="${x}" cy="${y}" rx="${w/2}" ry="${h/2}" fill="${color}" opacity=".95"/>
    <rect x="${x-w/2-.5}" y="${y-h*.5-.5}" width="${w+1}" height="${h*.5+1}" fill="#030a07"/>
    <ellipse cx="${x-w*.12}" cy="${y+h*.1}" rx="${w*.15}" ry="${h*.15}" fill="rgba(255,255,255,0.4)"/>
  </g>`;
}

function winkEye (x, y, w, color='#00e070') {
  return `<g style="filter:drop-shadow(0 0 5px ${color})">
    <path d="M${x-w/2} ${y} Q${x} ${y-w*.35} ${x+w/2} ${y}" fill="none" stroke="${color}" stroke-width="${w*.18}" stroke-linecap="round"/>
  </g>`;
}

function angryEye (x, y, w, h, color='#00e070') {
  return `<g style="filter:drop-shadow(0 0 5px ${color}) drop-shadow(0 0 9px ${color}40)">
    <path d="M${x-w/2} ${y+h*.3} Q${x-w/2} ${y-h*.4} ${x} ${y-h*.4} Q${x+w/2} ${y-h*.4} ${x+w/2} ${y+h*.3} Q${x+w*.2} ${y+h*.55} ${x} ${y+h*.55} Q${x-w*.2} ${y+h*.55} ${x-w/2} ${y+h*.3}Z" fill="${color}" opacity=".95"/>
    <ellipse cx="${x-w*.12}" cy="${y-h*.05}" rx="${w*.13}" ry="${h*.13}" fill="rgba(255,255,255,0.4)"/>
  </g>`;
}

function smileMouth (cx, y, w, depth, color='#00e070', strokeW=2.2) {
  return `<g style="filter:drop-shadow(0 0 5px ${color})">
    <path d="M${cx-w/2} ${y} Q${cx} ${y+depth} ${cx+w/2} ${y}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round"/>
  </g>`;
}

function frownMouth (cx, y, w, depth, color='#00e070', strokeW=2.2) {
  return `<g style="filter:drop-shadow(0 0 5px ${color})">
    <path d="M${cx-w/2} ${y} Q${cx} ${y-depth} ${cx+w/2} ${y}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round"/>
  </g>`;
}

function flatMouth (cx, y, w, color='#00e070') {
  return `<g style="filter:drop-shadow(0 0 4px ${color})">
    <line x1="${cx-w/2}" y1="${y}" x2="${cx+w/2}" y2="${y}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
  </g>`;
}

function rageMouth (cx, y, w, h, color='#ff2244') {
  return `<g style="filter:drop-shadow(0 0 6px ${color})">
    <path d="M${cx-w/2} ${y} Q${cx-w*.3} ${y-h*.2} ${cx} ${y-h*.15} Q${cx+w*.3} ${y-h*.2} ${cx+w/2} ${y} Q${cx} ${y+h} ${cx-w/2} ${y}Z" fill="${color}" opacity=".9"/>
    <ellipse cx="${cx-w*.12}" cy="${y-h*.35}" rx="${w*.1}" ry="${h*.12}" fill="rgba(255,255,255,0.3)"/>
    <line x1="${cx-w*.25}" y1="${y-h*.1}" x2="${cx+w*.25}" y2="${y-h*.1}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
  </g>`;
}

function browPair (cx, scCY, S, color) {
  return `<g style="filter:drop-shadow(0 0 3px ${color})">
    <path d="M${cx-S*.12} ${scCY-S*.12} L${cx-S*.04} ${scCY-S*.09}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
    <path d="M${cx+S*.04} ${scCY-S*.09} L${cx+S*.12} ${scCY-S*.12}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
  </g>`;
}

// ── Extras/decorations ──────────────────────────────────────

function sparkleExtras (S, scCX, scCY) {
  return `
    <text x="${scCX-S*.25}" y="${scCY-S*.2}" font-size="${S*.12}" fill="#00e070" text-anchor="middle" dominant-baseline="middle"
      style="filter:drop-shadow(0 0 5px #00e070);animation:sparkle-pop 1.2s ease-in-out infinite;">✦</text>
    <text x="${scCX+S*.27}" y="${scCY-S*.15}" font-size="${S*.09}" fill="#00e070" text-anchor="middle" dominant-baseline="middle"
      style="filter:drop-shadow(0 0 4px #00e070);animation:sparkle-pop 1.2s ease-in-out infinite .6s;">✦</text>`;
}

function questionExtra (S, scCX, scCY) {
  return `<text x="${scCX+S*.3}" y="${scCY-S*.08}" font-size="${S*.13}" fill="#4f8ef7" text-anchor="middle"
    style="filter:drop-shadow(0 0 5px #4f8ef7);animation:float-q 1.5s ease-in-out infinite;display:inline-block">?</text>`;
}

function sweatExtra (S, scCX, scCY) {
  return `<ellipse cx="${scCX+S*.2}" cy="${scCY-S*.04}" rx="${S*.025}" ry="${S*.042}"
    fill="#60a5fa" opacity=".8" style="animation:steam-rise .9s ease-in-out infinite"/>`;
}

function angerExtras (S, scCX, scCY) {
  return `
    ${browPair(scCX, scCY, S, '#ef4444')}
    <text x="${scCX+S*.28}" y="${scCY-S*.18}" font-size="${S*.09}" fill="#f97316" text-anchor="middle"
      style="filter:drop-shadow(0 0 4px #f97316);animation:steam-rise .7s ease-in-out infinite">~</text>
    <text x="${scCX+S*.22}" y="${scCY-S*.08}" font-size="${S*.09}" fill="#f97316" text-anchor="middle"
      style="filter:drop-shadow(0 0 4px #f97316);animation:steam-rise .7s ease-in-out infinite .35s">~</text>`;
}

function destroyerExtras (S, scCX, scCY) {
  return `
    ${browPair(scCX, scCY, S, '#ff2244')}
    <text x="${scCX-S*.28}" y="${scCY-S*.22}" font-size="${S*.11}" fill="#ff2244" text-anchor="middle"
      style="filter:drop-shadow(0 0 5px #ff2244);animation:steam-rise .4s ease-in-out infinite">!</text>
    <text x="${scCX+S*.28}" y="${scCY-S*.22}" font-size="${S*.11}" fill="#ff2244" text-anchor="middle"
      style="filter:drop-shadow(0 0 5px #ff2244);animation:steam-rise .4s ease-in-out infinite .2s">!</text>
    <text x="${scCX+S*.34}" y="${scCY-S*.08}" font-size="${S*.1}" fill="#ff4455" text-anchor="middle"
      style="filter:drop-shadow(0 0 4px #ff2244);animation:steam-rise .4s ease-in-out infinite .4s">!</text>`;
}

// ── Main SVG builder ────────────────────────────────────────

function buildMascotSVG (expressionKey, size = 120) {
  const S   = size;
  const cx  = S / 2;

  const isDestroyer = expressionKey === 'destroyer';
  const isAnger     = expressionKey === 'anger';
  const isConcerned = expressionKey === 'concerned';

  // Colors shift for angry/destroyer states
  const rimColor    = isDestroyer ? '#5a1020' : '#1e4a2a';
  const antColor    = isDestroyer ? '#ff2244' : isConcerned ? '#60a5fa' : '#00cc66';
  const antGlow     = isDestroyer ? '#ff0000' : isConcerned ? '#60a5fa' : '#00ff88';
  const heartColor  = isDestroyer ? '#ff2244' : isConcerned ? '#60a5fa' : '#00e070';
  const screenGlow  = isDestroyer ? '#ff2244' : '#00e070';
  const bodyBg1     = isDestroyer ? '#1a0508' : '#1a2e1f';
  const bodyBg2     = isDestroyer ? '#0d0208' : '#0d1a14';
  const rimBg1      = isDestroyer ? '#3a1020' : '#2d5a3a';
  const rimBg2      = isDestroyer ? '#1a0810' : '#0f2018';
  const glowFilter  = isDestroyer
    ? 'drop-shadow(0 6px 20px rgba(255,20,50,.45))'
    : 'drop-shadow(0 6px 18px rgba(0,200,80,.3))';

  const expr = MASCOT_EXPRESSIONS[expressionKey] || MASCOT_EXPRESSIONS.calm;

  /* proportions */
  const headW = S*.64,  headH = S*.56;
  const headX = cx - headW/2, headY = S*.04;
  const bodyW = S*.42,  bodyH = S*.28;
  const bodyX = cx - bodyW/2, bodyY = headY + headH*.72;
  const footLX = cx - S*.16, footRX = cx + S*.01, footY = bodyY + bodyH - .01*S;
  const armLX = bodyX - S*.08, armRX = bodyX + bodyW - S*.05, armY = bodyY + S*.02;
  const armW  = S*.13, armH = S*.22;
  const antTopY = headY - S*.14;
  const antBall = S*.055;
  const scX = headX + S*.07, scY = headY + S*.07;
  const scW = headW - S*.14, scH = headH - S*.14;
  const scCX = scX + scW/2, scCY = scY + scH/2;

  const parts = expr.build(S, cx, scCX, scCY);

  // Arm transform for anger/destroyer = crossed
  const armLTransform = (isAnger || isDestroyer)
    ? `rotate(50,${armLX+armW/2},${armY})`
    : `rotate(-10,${armLX+armW/2},${armY})`;
  const armRTransform = (isAnger || isDestroyer)
    ? `rotate(-50,${armRX+armW/2},${armY})`
    : `rotate(10,${armRX+armW/2},${armY})`;

  const uid = expressionKey + size;

  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
<defs>
  <radialGradient id="hg${uid}" cx="35%" cy="30%" r="70%">
    <stop offset="0%" stop-color="${bodyBg1}"/>
    <stop offset="100%" stop-color="${bodyBg2}"/>
  </radialGradient>
  <radialGradient id="bg${uid}" cx="50%" cy="30%" r="70%">
    <stop offset="0%" stop-color="${bodyBg1}"/>
    <stop offset="100%" stop-color="${bodyBg2}"/>
  </radialGradient>
  <radialGradient id="rg${uid}" cx="30%" cy="20%" r="80%">
    <stop offset="0%" stop-color="${rimBg1}"/>
    <stop offset="100%" stop-color="${rimBg2}"/>
  </radialGradient>
  <radialGradient id="sg${uid}" cx="50%" cy="50%" r="60%">
    <stop offset="0%" stop-color="#060f08"/>
    <stop offset="100%" stop-color="#020608"/>
  </radialGradient>
</defs>

<g style="animation:${expr.anim};transform-origin:${cx}px ${S*.5}px;" filter="${glowFilter}">

  <!-- feet -->
  <ellipse cx="${footLX+S*.08}" cy="${footY+S*.055}" rx="${S*.09}" ry="${S*.05}" fill="url(#bg${uid})"/>
  <ellipse cx="${footLX+S*.08}" cy="${footY+S*.055}" rx="${S*.073}" ry="${S*.038}" fill="none" stroke="${rimColor}" stroke-width="1.2" opacity=".6"/>
  <ellipse cx="${footRX+S*.08}" cy="${footY+S*.055}" rx="${S*.09}" ry="${S*.05}" fill="url(#bg${uid})"/>
  <ellipse cx="${footRX+S*.08}" cy="${footY+S*.055}" rx="${S*.073}" ry="${S*.038}" fill="none" stroke="${rimColor}" stroke-width="1.2" opacity=".6"/>

  <!-- body -->
  <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${bodyW*.28}" fill="url(#bg${uid})"/>
  <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="${bodyW*.28}" fill="none" stroke="${rimColor}" stroke-width="1.5" opacity=".7"/>
  <rect x="${bodyX+2}" y="${bodyY+2}" width="${bodyW-4}" height="${bodyH*.4}" rx="${bodyW*.24}" fill="url(#rg${uid})" opacity=".4"/>

  <!-- heart -->
  <g style="filter:drop-shadow(0 0 ${S*.03}px ${heartColor})">
    <path d="M${cx} ${bodyY+bodyH*.65} c0 0 ${-S*.086} ${-S*.065} ${-S*.086} ${-S*.12} a${S*.052} ${S*.052} 0 0 1 ${S*.086} ${-S*.028} a${S*.052} ${S*.052} 0 0 1 ${S*.086} ${S*.028} c0 ${S*.055} ${-S*.086} ${S*.12} ${-S*.086} ${S*.12}z" fill="${heartColor}" opacity=".92"/>
  </g>

  <!-- arms -->
  <rect x="${armLX}" y="${armY}" width="${armW}" height="${armH}" rx="${armW*.44}" fill="url(#bg${uid})" stroke="${rimColor}" stroke-width="1.2" transform="${armLTransform}" opacity=".9"/>
  <rect x="${armRX}" y="${armY}" width="${armW}" height="${armH}" rx="${armW*.44}" fill="url(#bg${uid})" stroke="${rimColor}" stroke-width="1.2" transform="${armRTransform}" opacity=".9"/>

  <!-- head outer bezel (3-D rim) -->
  <rect x="${headX}" y="${headY}" width="${headW}" height="${headH}" rx="${headW*.22}" fill="url(#rg${uid})"/>
  <rect x="${headX+S*.018}" y="${headY+S*.018}" width="${headW-S*.036}" height="${headH-S*.036}" rx="${headW*.19}" fill="url(#hg${uid})"/>
  <rect x="${headX}" y="${headY}" width="${headW}" height="${headH}" rx="${headW*.22}" fill="none" stroke="${rimColor}" stroke-width="1.8" opacity=".85"/>
  <!-- gloss highlight -->
  <rect x="${headX+S*.05}" y="${headY+S*.025}" width="${headW*.44}" height="${headH*.17}" rx="${S*.03}" fill="rgba(255,255,255,0.045)"/>

  <!-- screen face -->
  <rect x="${scX}" y="${scY}" width="${scW}" height="${scH}" rx="${scW*.18}" fill="url(#sg${uid})"/>
  <rect x="${scX}" y="${scY}" width="${scW}" height="${scH}" rx="${scW*.18}" fill="none" stroke="${screenGlow}" stroke-width=".6" opacity=".14"/>

  <!-- facial features -->
  ${parts.eyeL}
  ${parts.eyeR}
  ${parts.mouth}
  ${parts.extras}

  <!-- antenna pole -->
  <rect x="${cx-S*.02}" y="${antTopY+antBall}" width="${S*.04}" height="${S*.14-antBall}" rx="${S*.02}" fill="url(#bg${uid})" stroke="${rimColor}" stroke-width="1" opacity=".9"/>
  <!-- antenna ball -->
  <circle cx="${cx}" cy="${antTopY+antBall}" r="${antBall}" fill="${antColor}" style="filter:drop-shadow(0 0 ${S*.06}px ${antGlow}) drop-shadow(0 0 ${S*.1}px ${antGlow}50)"/>
  <ellipse cx="${cx-antBall*.25}" cy="${antTopY+antBall*.62}" rx="${antBall*.35}" ry="${antBall*.25}" fill="rgba(255,255,255,0.25)"/>

</g>
</svg>`;
}

// ── Public API ──────────────────────────────────────────────

/**
 * Render mascot into a container element.
 * @param {HTMLElement|string} container  - element or element ID
 * @param {string}             expression - key from MASCOT_EXPRESSIONS
 * @param {number}             size       - SVG size in px
 */
function renderMascot (container, expression, size = 120) {
  const el = typeof container === 'string'
    ? document.getElementById(container)
    : container;
  if (!el) return;
  el.innerHTML = buildMascotSVG(expression, size);
}

/**
 * Get the right expression key for a given reel count.
 */
function getMascotExpression (totalReels) {
  return getExpression(totalReels);
}

/**
 * Get the quote string for the given expression and data.
 * @param {string} expressionKey
 * @param {{total:number}} reelData  - { total: number }
 * @param {{distStr:string}} compData - { distStr: string }
 */
function getMascotQuote (expressionKey, reelData, compData) {
  const expr = MASCOT_EXPRESSIONS[expressionKey];
  if (!expr) return '';
  return expr.quote(reelData, compData);
}

/**
 * Get color for the current expression.
 */
function getMascotColor (expressionKey) {
  return (MASCOT_EXPRESSIONS[expressionKey] || MASCOT_EXPRESSIONS.calm).color;
}