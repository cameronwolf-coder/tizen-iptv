/* player.js — unified player with two backends:
   1) Tizen AVPlay (native, hardware-decoded TS/HLS) — used on the TV.
   2) HTML5 <video> (+ hls.js if present) — used for desktop-browser testing.
   Public API: Player.play(url, cb), .stop(), .on(event, fn)
   events: 'buffering','playing','error' */
(function (g) {
  var listeners = {};
  function emit(ev, data) { (listeners[ev] || []).forEach(function (f) { f(data); }); }

  var hasAV = !!(g.webapis && webapis.avplay) && !g.__noWebapis;
  var av = hasAV ? webapis.avplay : null;
  var v = document.getElementById('html5-player');
  var obj = document.getElementById('av-player');
  var browser = document.getElementById('browser');
  var overlay = document.getElementById('player-overlay');
  var current = null;
  var avGeneration = 0;

  function setPlaybackVisible(visible) {
    if (browser) {
      if (visible) browser.classList.add('hidden');
      else browser.classList.remove('hidden');
    }
    if (overlay) {
      if (visible) overlay.classList.remove('hidden');
      else overlay.classList.add('hidden');
    }
  }

  // ---------- AVPlay backend ----------
  function hlsFallback(url) {
    return /\.ts(?=([?#]|$))/i.test(url)
      ? url.replace(/\.ts(?=([?#]|$))/i, '.m3u8')
      : null;
  }

  function avErrorMessage(eventType, errorMessage) {
    var detail = null;
    if (typeof errorMessage === 'string') {
      try { detail = JSON.parse(errorMessage); } catch (e) {}
    } else if (errorMessage && typeof errorMessage === 'object') {
      detail = errorMessage;
    }
    var code = detail && detail.error_code;
    if (!code && typeof eventType === 'string') code = eventType;
    if (!code && eventType) code = eventType.error_code || eventType.eventType || eventType.name;
    var parts = [code || 'avplay error'];
    ['codec', 'demux', 'resolution', 'fps', 'detail_info'].forEach(function (key) {
      if (detail && detail[key]) parts.push(String(detail[key]));
    });
    if (detail && detail.connect_error && detail.connect_error.curl != null) {
      parts.push('curl ' + detail.connect_error.curl);
    }
    return parts.join(' · ');
  }

  function avListener(generation, fail) {
    function active(fn) {
      if (generation === avGeneration) fn();
    }
    return {
      onbufferingstart: function () { active(function () { emit('buffering', true); }); },
      onbufferingcomplete: function () { active(function () { emit('buffering', false); }); },
      onbufferingprogress: function () {},
      onstreamcompleted: function () { active(function () { emit('error', 'stream ended'); }); },
      oncurrentplaytime: function () {},
      onevent: function () {},
      onerror: function (eventType) { fail(eventType); },
      onerrormsg: function (eventType, errorMessage) { fail(eventType, errorMessage); }
    };
  }

  function avPlay(url, fallback) {
    var generation = ++avGeneration;
    var failed = false;
    function fail(eventType, errorMessage) {
      if (failed || generation !== avGeneration) return;
      failed = true;
      if (fallback) {
        current = fallback;
        avPlay(fallback, null);
      } else {
        emit('error', avErrorMessage(eventType, errorMessage));
      }
    }
    try {
      try { av.stop(); av.close(); } catch (e) {}
      av.open(url);
      av.setDisplayRect(0, 0, 1920, 1080);
      try { av.setStreamingProperty('ADAPTIVE_INFO', 'BITRATES=|STARTBITRATE=HIGHEST'); } catch (e) {}
      av.setListener(avListener(generation, fail));
      emit('buffering', true);
      av.prepareAsync(function () {
        if (generation !== avGeneration) return;
        try { obj.style.display = 'block'; av.play(); emit('playing'); }
        catch (e) { fail(e); }
      }, function (e) { fail(e); });
    } catch (e) { fail(e); }
  }

  function avStop() {
    avGeneration++;
    try { av.stop(); av.close(); } catch (e) {}
    if (obj) obj.style.display = 'none';
  }

  // ---------- HTML5 backend ----------
  var hls = null;
  function h5Play(url) {
    v.style.display = 'block';
    emit('buffering', true);
    v.onplaying = function () { emit('playing'); };
    v.onwaiting = function () { emit('buffering', true); };
    v.onerror = function () { emit('error', 'video error'); };
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    var isHls = /\.m3u8(\?|$)/i.test(url);
    if (isHls && g.Hls && Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true });
      hls.loadSource(url); hls.attachMedia(v);
      hls.on(Hls.Events.ERROR, function (_, d) { if (d.fatal) emit('error', d.type); });
    } else {
      v.src = url;
    }
    var p = v.play(); if (p && p.catch) p.catch(function () {});
  }
  function h5Stop() { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} if (v) v.style.display = 'none'; if (hls) { try { hls.destroy(); } catch (e) {} hls = null; } }

  var Player = {
    backend: hasAV ? 'avplay' : 'html5',
    on: function (ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn); },
    play: function (url) { current = url; setPlaybackVisible(true); hasAV ? avPlay(url, hlsFallback(url)) : h5Play(url); },
    stop: function () { current = null; hasAV ? avStop() : h5Stop(); setPlaybackVisible(false); },
    current: function () { return current; }
  };

  g.Player = Player;
})(window);
