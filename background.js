// ============================================================
// FocusGuard Insights — background.js (Service Worker) v2
//
// CHANGES FROM v1:
// 1. SESSION_SNAPSHOT matching is now smarter — it matches by
//    sessionStart timestamp, not just "last session of that platform".
//    This prevents a new Short triggering a snapshot from overwriting
//    an unrelated Instagram session that happened to be last.
// 2. mergeSessions() added — called on every GET_DAY and GET_ALL_DATES
//    read. Merges sessions of the same platform that are less than
//    30 minutes apart into one combined session. This cleans up any
//    fragmented sessions that slipped through (e.g. from old data).
// 3. Full [FocusGuard BG] debug logging added throughout.
//
// RETAINED FROM v1:
// - Self-healing loadDay (count reconstructed from sessions if zero)
// - syncCountWithSessions after every write
// - GET_ALL_DATES returns both {dates:[]} and {data:{}}
// ============================================================

'use strict';

const MERGE_GAP_MS = 30 * 60 * 1000; // 30 min — sessions closer than this get merged

// Helper Functions Section
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateKeyFromTs(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function blankDay() {
  return {
    instagram: { count: 0, reelTimestamps: [] },
    youtube:   { count: 0, reelTimestamps: [] },
    sessions:  []
  };
}

// Session Merger Section
function mergeSessions(sessions) {
  if (!sessions || sessions.length === 0) return [];

  // Sort chronologically first
  const sorted = [...sessions].sort((a, b) => a.start - b.start);
  const merged = [];

  for (const sess of sorted) {
    const prev = merged[merged.length - 1];

    const canMerge =
      prev &&
      prev.platform === sess.platform &&
      (sess.start - prev.end) < MERGE_GAP_MS;

    if (canMerge) {
      // Extend the previous session to absorb this one
      prev.end        = Math.max(prev.end, sess.end);
      prev.reelCount += sess.reelCount || 0;
      // Keep inProgress true if either is still in progress
      prev.inProgress = prev.inProgress || sess.inProgress;
      console.log(`[FocusGuard BG] Merged session — platform: ${prev.platform}, now ${prev.reelCount} reels, ${new Date(prev.start).toLocaleTimeString()} → ${new Date(prev.end).toLocaleTimeString()}`);
    } else {
      merged.push({ ...sess }); // push a copy so we don't mutate original
    }
  }

  console.log(`[FocusGuard BG] mergeSessions: ${sessions.length} raw → ${merged.length} merged`);
  return merged;
}

// Load Day Section
async function loadDay(dateKey) {
  return new Promise(resolve => {
    chrome.storage.local.get(dateKey, result => {
      const day = result[dateKey]
        ? JSON.parse(JSON.stringify(result[dateKey]))
        : blankDay();

      if (!day.instagram) day.instagram = { count: 0, reelTimestamps: [] };
      if (!day.youtube)   day.youtube   = { count: 0, reelTimestamps: [] };
      if (!day.sessions)  day.sessions  = [];

      // Merge fragmented sessions before returning
      day.sessions = mergeSessions(day.sessions);

      // Self-heal counts from merged sessions
      const sessIG = day.sessions
        .filter(s => s.platform === 'instagram')
        .reduce((sum, s) => sum + (s.reelCount || 0), 0);
      const sessYT = day.sessions
        .filter(s => s.platform === 'youtube')
        .reduce((sum, s) => sum + (s.reelCount || 0), 0);

      if (sessIG > day.instagram.count) {
        console.log(`[FocusGuard BG] Self-heal IG count: ${day.instagram.count} → ${sessIG}`);
        day.instagram.count = sessIG;
      }
      if (sessYT > day.youtube.count) {
        console.log(`[FocusGuard BG] Self-heal YT count: ${day.youtube.count} → ${sessYT}`);
        day.youtube.count = sessYT;
      }

      resolve(day);
    });
  });
}

async function saveDay(dateKey, dayData) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [dateKey]: dayData }, () => {
      console.log(`[FocusGuard BG] Saved day ${dateKey} — IG: ${dayData.instagram.count}, YT: ${dayData.youtube.count}, sessions: ${dayData.sessions.length}`);
      resolve();
    });
  });
}

// Badge Update Section
async function refreshBadge() {
  const day   = await loadDay(todayKey());
  const total = day.instagram.count + day.youtube.count;
  const text  = total === 0 ? '' : total > 999 ? '999+' : String(total);

  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({
    color: total === 0  ? '#22c55e'
         : total < 60  ? '#f59e0b'
         : total < 150 ? '#ef4444'
         :               '#8b5cf6'
  });
  console.log(`[FocusGuard BG] Badge updated: "${text}" (total: ${total})`);
}

// Count Sync Section
function syncCountWithSessions(day, platform) {
  const bucket = platform === 'instagram' ? 'instagram' : 'youtube';
  const sessTotal = day.sessions
    .filter(s => s.platform === platform)
    .reduce((sum, s) => sum + (s.reelCount || 0), 0);
  if (sessTotal > day[bucket].count) {
    console.log(`[FocusGuard BG] syncCount ${platform}: ${day[bucket].count} → ${sessTotal}`);
    day[bucket].count = sessTotal;
  }
}

// Message Handler Section
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`[FocusGuard BG] Message received: ${message.type}`, message);
  handleMessage(message)
    .then(sendResponse)
    .catch(err => {
      console.error('[FocusGuard BG] Handler error:', err);
      sendResponse({ ok: false, error: err.message });
    });
  return true;
});

// Message Processing Section
async function handleMessage(msg) {

  // Reel Counted Handler
  if (msg.type === 'REEL_COUNTED') {
    const dateKey = dateKeyFromTs(msg.timestamp);
    const day     = await loadDay(dateKey);
    const bucket  = msg.platform === 'instagram' ? 'instagram' : 'youtube';
    day[bucket].count++;
    day[bucket].reelTimestamps.push(msg.timestamp);
    console.log(`[FocusGuard BG] REEL_COUNTED — ${msg.platform} count now: ${day[bucket].count}`);
    await saveDay(dateKey, day);
    await refreshBadge();
    return { ok: true };
  }

  // ── 2. Session snapshot ───────────────────────────────
  if (msg.type === 'SESSION_SNAPSHOT') {
    const dateKey = dateKeyFromTs(msg.sessionStart);
    const day     = await loadDay(dateKey);

    // FIX: match by sessionStart timestamp, not just last platform session
    // This prevents overwriting a different platform's session
    const existingIdx = day.sessions.findIndex(
      s => s.platform === msg.platform && s.start === msg.sessionStart
    );

    const snap = {
      platform  : msg.platform,
      start     : msg.sessionStart,
      end       : msg.sessionEnd,
      reelCount : msg.reelCount,
      inProgress: true
    };

    if (existingIdx >= 0) {
      day.sessions[existingIdx] = snap;
      console.log(`[FocusGuard BG] SESSION_SNAPSHOT updated existing session idx ${existingIdx}`);
    } else {
      day.sessions.push(snap);
      console.log(`[FocusGuard BG] SESSION_SNAPSHOT created new session (total: ${day.sessions.length})`);
    }

    syncCountWithSessions(day, msg.platform);
    await saveDay(dateKey, day);
    await refreshBadge();
    return { ok: true };
  }

  // Session Ended Handler
  if (msg.type === 'SESSION_END') {
    const dateKey = dateKeyFromTs(msg.sessionStart);
    const day     = await loadDay(dateKey);

    // FIX: same — match by sessionStart timestamp
    const existingIdx = day.sessions.findIndex(
      s => s.platform === msg.platform && s.start === msg.sessionStart
    );

    const final = {
      platform  : msg.platform,
      start     : msg.sessionStart,
      end       : msg.sessionEnd,
      reelCount : msg.reelCount,
      inProgress: false
    };

    if (existingIdx >= 0) {
      day.sessions[existingIdx] = final;
      console.log(`[FocusGuard BG] SESSION_END finalised session idx ${existingIdx} — ${msg.reelCount} reels`);
    } else {
      day.sessions.push(final);
      console.log(`[FocusGuard BG] SESSION_END pushed new final session — ${msg.reelCount} reels`);
    }

    syncCountWithSessions(day, msg.platform);
    await saveDay(dateKey, day);
    await refreshBadge();
    return { ok: true };
  }

  // Get Day Handler
  if (msg.type === 'GET_DAY') {
    const dateKey = msg.dateKey || todayKey();
    const day     = await loadDay(dateKey); // self-heals + merges on read
    console.log(`[FocusGuard BG] GET_DAY ${dateKey} — IG: ${day.instagram.count}, YT: ${day.youtube.count}, sessions: ${day.sessions.length}`);
    return { ok: true, data: day, dateKey };
  }

  // Get All Dates Handler
  if (msg.type === 'GET_ALL_DATES') {
    return new Promise(resolve => {
      chrome.storage.local.get(null, all => {
        const dates = [];
        const data  = {};
        Object.keys(all).forEach(k => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
          const day    = all[k] || {};
          const ig     = day.instagram?.count || 0;
          const yt     = day.youtube?.count   || 0;
          const sessIG = (day.sessions || [])
            .filter(s => s.platform === 'instagram')
            .reduce((sum, s) => sum + (s.reelCount || 0), 0);
          const sessYT = (day.sessions || [])
            .filter(s => s.platform === 'youtube')
            .reduce((sum, s) => sum + (s.reelCount || 0), 0);
          const total  = Math.max(ig, sessIG) + Math.max(yt, sessYT);
          dates.push(k);
          data[k] = total;
        });
        console.log(`[FocusGuard BG] GET_ALL_DATES — ${dates.length} days found`);
        resolve({ ok: true, dates, data });
      });
    });
  }

  console.warn('[FocusGuard BG] Unknown message type:', msg.type);
  return { ok: false, error: 'Unknown message type' };
}

// Lifecycle Events Section
chrome.runtime.onInstalled.addListener(async () => {
  const dateKey = todayKey();
  const day     = await loadDay(dateKey);
  await saveDay(dateKey, day);
  await refreshBadge();
  console.log('[FocusGuard BG] Extension installed/updated. Session merge + self-healing active.');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[FocusGuard BG] Browser started — refreshing badge.');
  refreshBadge();
});