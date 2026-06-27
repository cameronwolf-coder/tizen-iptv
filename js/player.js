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
  var current = null;

  // ---------- AVPlay backend ----------
  function avListener() {
    return {
      onbufferingstart: function () { emit('buffering', true); },
      onbufferingcomplete: function () { emit('buffering', false); },
      onbufferingprogress: function () {},
      onstreamcompleted: function () { emit('error', 'stream ended'); },
      oncurrentplaytime: function () {},
      onevent: function () {},
      onerror: function (e) { emit('error', (e && e.eventType) || 'avplay error'); }
    };
  }

  function avPlay(url) {
    try {
      try { av.stop(); av.close(); } catch (e) {}
      av.open(url);
      av.setDisplayRect(0, 0, 1920, 1080);
      try { av.setStreamingProperty('ADAPTIVE_INFO', 'BITRATES=|STARTBITRATE=HIGHEST'); } catch (e) {}
      av.setListener(avListener());
      emit('buffering', true);
      av.prepareAsync(function () {
        try { obj.style.display = 'block'; av.play(); emit('playing'); }
        catch (e) { emit('error', 'play failed'); }
      }, function (e) { emit('error', 'prepare failed'); });
    } catch (e) { emit('error', String(e)); }
  }

  function avStop() { try { av.stop(); av.close(); } catch (e) {} if (obj) obj.style.display = 'none'; }

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
    play: function (url) { current = url; hasAV ? avPlay(url) : h5Play(url); },
    stop: function () { current = null; hasAV ? avStop() : h5Stop(); },
    current: function () { return current; }
  };

  g.Player = Player;
})(window);
