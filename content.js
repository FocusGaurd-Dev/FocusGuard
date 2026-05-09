// ============================================================
// FocusGuard Insights — content.js  (v2 — session fix)
// Injected into Instagram and YouTube pages.
// Detects Reels / Shorts, timestamps each one, tracks sessions.
//
// CHANGES FROM v1:
// 1. INACTIVITY_LIMIT_MS: 5 min → 30 min
//    Rationale: short breaks (water, messages) should not split sessions.
// 2. Tab switching (visibilitychange) no longer flushes the session.
//    Instead it only clears the pending 3s timer so the current
//    in-progress video isn't counted while the tab is hidden.
//    The session stays alive and resumes when the user comes back,
//    as long as it's within the 30-min inactivity window.
// 3. beforeunload still flushes (tab/browser actually closing).
// 4. Navigation away from Reels/Shorts still flushes (correct behaviour).
// 5. Full [FocusGuard] debug logging added throughout.
// ============================================================

(function () {
  'use strict';

  // Constants Section
  const PLATFORM             = detectPlatform();
  const COUNT_THRESHOLD_MS   = 3000;           // watch 3s before it counts
  const INACTIVITY_LIMIT_MS  = 30 * 60 * 1000; // 30 min gap = new session (was 5)

  if (!PLATFORM) return; // not a tracked page, bail out

  console.log(`[FocusGuard] content.js booted on platform: ${PLATFORM}`);

  // State Variables Section
  let pendingTimer      = null;   // 3-second count timer
  let currentVideoEl    = null;   // the video element we're watching
  let currentVideoSrc   = null;   // the source URL of the current video
  let sessionStart      = null;   // timestamp (ms) of session start
  let lastReelTime      = null;   // timestamp (ms) of last counted reel
  let sessionReelCount  = 0;      // reels counted in this session

  // Platform Detection Section
  function detectPlatform () {
    const host = window.location.hostname;
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('youtube.com'))   return 'youtube';
    return null;
  }

  // Page Check Section
  function isOnReelsPage () {
    const path = window.location.pathname;
    if (PLATFORM === 'instagram') {
      return path.includes('/reels') || document.querySelector('video[autoplay]') !== null;
    }
    if (PLATFORM === 'youtube') {
      return path.startsWith('/shorts/');
    }
    return false;
  }

  // Reel Counter Section
  function countReel () {
    const now = Date.now();

    // ── Session boundary logic ──
    // Only split session if user has been inactive for 30+ minutes
    if (lastReelTime !== null && (now - lastReelTime) > INACTIVITY_LIMIT_MS) {
      const gapMins = Math.round((now - lastReelTime) / 60000);
      console.log(`[FocusGuard] Inactivity gap of ${gapMins}m detected — flushing old session, starting new one.`);
      flushSession();
    }

    if (sessionStart === null) {
      sessionStart     = now;
      sessionReelCount = 0;
      console.log(`[FocusGuard] New session started at ${new Date(now).toLocaleTimeString()} on ${PLATFORM}`);
    }

    sessionReelCount++;
    lastReelTime = now;

    console.log(`[FocusGuard] Reel #${sessionReelCount} counted on ${PLATFORM} at ${new Date(now).toLocaleTimeString()}`);

    // ── Send reel event to background ──
    chrome.runtime.sendMessage({
      type      : 'REEL_COUNTED',
      platform  : PLATFORM,
      timestamp : now
    }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn('[FocusGuard] REEL_COUNTED send error:', chrome.runtime.lastError.message);
      } else {
        console.log('[FocusGuard] REEL_COUNTED ack:', res);
      }
    });

    // ── Flush session snapshot every reel (crash safety) ──
    chrome.runtime.sendMessage({
      type         : 'SESSION_SNAPSHOT',
      platform     : PLATFORM,
      sessionStart : sessionStart,
      sessionEnd   : now,
      reelCount    : sessionReelCount
    }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn('[FocusGuard] SESSION_SNAPSHOT send error:', chrome.runtime.lastError.message);
      } else {
        console.log(`[FocusGuard] SESSION_SNAPSHOT saved — reels so far this session: ${sessionReelCount}`);
      }
    });
  }

  // Session Flusher Section
  function flushSession () {
    if (sessionStart === null) {
      console.log('[FocusGuard] flushSession called but no active session — skipping.');
      return;
    }
    const duration = Math.round(((lastReelTime || Date.now()) - sessionStart) / 60000);
    console.log(`[FocusGuard] Flushing session — platform: ${PLATFORM}, reels: ${sessionReelCount}, duration: ~${duration}m`);

    chrome.runtime.sendMessage({
      type         : 'SESSION_END',
      platform     : PLATFORM,
      sessionStart : sessionStart,
      sessionEnd   : lastReelTime || Date.now(),
      reelCount    : sessionReelCount
    }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn('[FocusGuard] SESSION_END send error:', chrome.runtime.lastError.message);
      } else {
        console.log('[FocusGuard] SESSION_END ack:', res);
      }
    });

    sessionStart     = null;
    sessionReelCount = 0;
    lastReelTime     = null;
  }

  // Watch Timer Section
  function startWatchTimer (videoEl) {
    const src = videoEl.currentSrc || videoEl.src;
    if (!src) return;

    // If it's the same element AND same source, we're already tracking it
    if (videoEl === currentVideoEl && src === currentVideoSrc) return;

    clearPendingTimer();

    currentVideoEl  = videoEl;
    currentVideoSrc = src;

    console.log(`[FocusGuard] Watch timer started — will count in 3s if still playing.`);

    pendingTimer = setTimeout(() => {
      if (currentVideoEl === videoEl && (videoEl.currentSrc || videoEl.src) === src && !videoEl.paused) {
        countReel();
      } else {
        console.log('[FocusGuard] Watch timer fired but video changed or paused — not counting.');
      }
      pendingTimer = null;
    }, COUNT_THRESHOLD_MS);
  }

  // Timer Clear Section
  function clearPendingTimer () {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer    = null;
      console.log('[FocusGuard] Pending watch timer cleared.');
    }
    currentVideoEl  = null;
    currentVideoSrc = null;
  }

  // Instagram Reels Detection Section
  function initInstagram () {
    console.log('[FocusGuard] Instagram detector initialised.');

    function handleVideoChange (videoEl) {
      if (!videoEl) return;
      if (!isOnReelsPage()) return;
      startWatchTimer(videoEl);
    }

    function findActiveReelVideo () {
      const videos = Array.from(document.querySelectorAll('main video, .reels-video-container video'));
      return videos.find(v =>
        !v.paused &&
        v.readyState >= 2 &&
        v.getBoundingClientRect().top    < window.innerHeight * 0.8 &&
        v.getBoundingClientRect().bottom > window.innerHeight * 0.2
      ) || null;
    }

    // Watch for DOM changes — new reel videos appear as user swipes
    const observer = new MutationObserver(() => {
      if (!isOnReelsPage()) return;
      const active = findActiveReelVideo();
      if (active) handleVideoChange(active);
    });

    observer.observe(document.body, {
      childList      : true,
      subtree        : true,
      attributes     : true,
      attributeFilter: ['autoplay', 'src']
    });

    // Periodic fallback for SPA state changes
    setInterval(() => {
      if (isOnReelsPage()) {
        const active = findActiveReelVideo();
        if (active) handleVideoChange(active);
      }
    }, 1000);

    // Initial check on page load
    const initial = findActiveReelVideo();
    if (initial) handleVideoChange(initial);

    // Flush when navigating away from Reels within Instagram SPA
    window.addEventListener('popstate', () => {
      if (!isOnReelsPage()) {
        console.log('[FocusGuard] Navigated away from Instagram Reels — flushing session.');
        clearPendingTimer();
        flushSession();
      }
    });
  }

  // YouTube Shorts Detection Section
  function initYouTube () {
    console.log('[FocusGuard] YouTube detector initialised.');
    let lastShortUrl = '';

    function onYTNavigate () {
      const path = window.location.pathname;

      if (path.startsWith('/shorts/')) {
        const currentUrl = window.location.href;
        if (currentUrl !== lastShortUrl) {
          // Moved to a different Short — clear timer, let setInterval re-detect
          console.log('[FocusGuard] YouTube Short URL changed — clearing pending timer.');
          clearPendingTimer();
        }
        lastShortUrl = currentUrl;
      } else {
        // Navigated out of Shorts entirely → flush session
        console.log('[FocusGuard] Navigated away from YouTube Shorts — flushing session.');
        clearPendingTimer();
        flushSession();
        lastShortUrl = '';
      }
    }

    // Periodic check — YouTube URL changes aren't always caught by events
    setInterval(() => {
      if (window.location.pathname.startsWith('/shorts/')) {
        const video = document.querySelector('ytd-shorts video, #shorts-container video');
        if (video && !video.paused && video.readyState >= 3) {
          startWatchTimer(video);
        }
      }
    }, 1000);

    window.addEventListener('yt-navigate-finish', onYTNavigate);

    if (window.location.pathname.startsWith('/shorts/')) {
      lastShortUrl = window.location.href;
    }
  }

  // Visibility Change Handler Section
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log('[FocusGuard] Tab hidden — clearing watch timer only. Session kept alive (30-min window).');
      clearPendingTimer();
      // ✅ NO flushSession() here — this was the main cause of session fragmentation
    } else {
      console.log('[FocusGuard] Tab visible again — session will resume if within 30-min window.');
    }
  });

  // Window Unload Handler Section
  window.addEventListener('beforeunload', () => {
    console.log('[FocusGuard] beforeunload — final session flush.');
    clearPendingTimer();
    flushSession();
  });

  // Platform Router Section
  if (PLATFORM === 'instagram') initInstagram();
  if (PLATFORM === 'youtube')   initYouTube();

})();