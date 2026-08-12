/* app.js — orchestrator: boot, data load, virtualized list, D-pad nav, playback. */
(function (g) {
  'use strict';
  var KEY = NAV.KEY;
  var ROW_H = 84;
  var REFRESH_MS = 6 * 3600 * 1000; // refresh playlist if older than 6h

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    browser: $('browser'), cats: $('categories'), catTrack: $('category-track'),
    track: $('channel-track'), viewport: $('channel-viewport'), search: $('search-box'),
    guideMeta: $('guide-meta'), scrollRail: $('scroll-rail'), scrollThumb: $('scroll-thumb'),
    channelTotal: $('channel-total'), clock: $('clock'),
    pLogo: $('preview-logo'), pName: $('preview-name'), pNow: $('preview-now'),
    pNext: $('preview-next'), pProgress: $('preview-progress-bar'),
    overlay: $('player-overlay'), osd: $('osd'), osdLogo: $('osd-logo'), osdName: $('osd-name'),
    osdNow: $('osd-now'), osdBar: $('osd-bar'), spinner: $('osd-spinner'),
    setup: $('setup'), cfgM3u: $('cfg-m3u'), cfgEpg: $('cfg-epg'), cfgRelay: $('cfg-relay'), cfgSave: $('cfg-save'),
    setupStatus: $('setup-status'), toast: $('toast'), remoteStatus: $('remote-status')
  };

  var S = {
    channels: [], cats: ['All'], counts: {},
    catIndex: 0, view: [], focus: 0, scrollTop: 0,
    zone: 'list',            // 'cats' | 'list' | 'search' | 'setup' | 'player'
    query: '', epg: null, osdTimer: 0, setupFocus: 0, didRestore: false
  };
  var X = null, MODE = 'm3u', epgCache = {};
  var remoteBridge = g.RemoteBridge ? g.RemoteBridge.create({
    name: 'Wolf TV',
    getRelayUrl: function () { return Store.getRelayUrl(); },
    onStatus: function (message) { els.remoteStatus.textContent = message; },
    onPlay: function (channel) { playChannel(channel); },
    onStop: function () { stopPlayback(); }
  }) : null;

  function now() { return (new Date()).getTime(); }
  function setClock() {
    var d = new Date(), h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2);
    els.clock.textContent = ((h + 11) % 12 + 1) + ':' + m + (h >= 12 ? ' PM' : ' AM');
  }
  function toast(msg) {
    els.toast.textContent = msg; els.toast.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(function () { els.toast.classList.add('hidden'); }, 2600);
  }

  /* ---------------- data loading ---------------- */
  function httpText(url) {
    return new Promise(function (res, rej) {
      try {
        var x = new XMLHttpRequest();
        x.open('GET', url, true); x.timeout = 30000;
        x.onload = function () { (x.status >= 200 && x.status < 400) ? res(x.responseText) : rej(new Error('HTTP ' + x.status)); };
        x.onerror = function () { rej(new Error('network')); };
        x.ontimeout = function () { rej(new Error('timeout')); };
        x.send();
      } catch (e) { rej(e); }
    });
  }

  function applyPlaylist(parsed) {
    S.channels = parsed.channels;
    S.counts = parsed.counts || {};
    els.channelTotal.textContent = parsed.channels.length;
    S.cats = parsed.cats.slice();
    if (S.cats[0] === 'All') S.cats.splice(1, 0, 'Favorites');
    else S.cats.unshift('Favorites');
  }

  function syncRemote() { if (remoteBridge) remoteBridge.sync(S.channels); }

  function loadFromCache() {
    var c = Store.getCachedPlaylist();
    if (!c || !c.channels.length) return false;
    applyPlaylist({ channels: c.channels, cats: c.cats, counts: {} });
    return true;
  }

  function refreshPlaylist(silent) {
    var cfg = Store.getConfig();
    if (cfg.type === 'xtream') return loadXtream(cfg, silent);
    if (!cfg.m3u) { showSetup(); return; }
    if (!silent) toast('Loading playlist…');
    httpText(cfg.m3u).then(function (txt) {
      var parsed = M3U.parse(txt);
      applyPlaylist(parsed);
      syncRemote();
      var saved = Store.savePlaylist(parsed.channels, parsed.cats, now());
      if (!saved) toast('Loaded (too large to cache)');
      selectCategory(S.catIndex, true);
      renderCats();
      if (!silent) toast(parsed.channels.length + ' channels');
    }).catch(function (e) {
      if (!silent) toast('Playlist failed: ' + e.message);
      if (silent) syncRemote();
    });
    if (cfg.epg) {
      httpText(cfg.epg).then(function (txt) { S.epg = EPG.parse(txt); updatePreview(); })
        .catch(function () {});
    }
  }

  // Xtream: load live categories + all live streams once (structured, not the 213MB M3U).
  function loadXtream(cfg, silent) {
    MODE = 'xtream';
    X = new Xtream({ base: cfg.base, user: cfg.user, pass: cfg.pass });
    if (!silent) toast('Loading channels…');
    Promise.all([X.liveCategories(), X.liveStreams()]).then(function (r) {
      var cats = r[0] || [], streams = r[1] || [];
      var nameById = {}; cats.forEach(function (c) { nameById[c.category_id] = c.category_name; });
      var counts = {};
      var channels = streams.map(function (s, i) {
        var grp = nameById[s.category_id] || 'Uncategorized';
        counts[grp] = (counts[grp] || 0) + 1;
        return { num: i + 1, id: s.epg_channel_id || '', name: s.name, logo: s.stream_icon || '',
                 group: grp, url: X.streamUrl(s.stream_id, false), stream_id: s.stream_id };
      });
      var have = {}, uniq = [];
      cats.forEach(function (c) { var n = c.category_name; if (counts[n] && !have[n]) { have[n] = 1; uniq.push(n); } });
      if (counts['Uncategorized']) uniq.push('Uncategorized');
      var parsed = { channels: channels, cats: ['All'].concat(uniq), counts: counts };
      applyPlaylist(parsed);
      syncRemote();
      Store.savePlaylist(channels, parsed.cats, now()); // may exceed quota; harmless if so
      selectCategory(0, false); renderCats();
      if (!silent) toast(channels.length + ' live channels');
    }).catch(function (e) { if (!silent) toast('Load failed: ' + e.message); else syncRemote(); });
  }

  /* ---------------- categories ---------------- */
  function renderCats() {
    var html = '';
    for (var i = 0; i < S.cats.length; i++) {
      var name = S.cats[i];
      var cnt = name === 'All' ? S.channels.length
        : name === 'Favorites' ? Object.keys(Store.favs()).length
        : (S.counts[name] || '');
      html += '<div role="option" aria-selected="' + (i === S.catIndex) + '" class="cat-item' +
        (i === S.catIndex ? ' active' : '') +
        (S.zone === 'cats' && i === S.catIndex ? ' focused' : '') + '" data-i="' + i + '">' +
        '<span>' + esc(name) + '</span><span class="count">' + cnt + '</span></div>';
    }
    els.catTrack.innerHTML = html;
    var active = els.catTrack.children[S.catIndex];
    if (!active) return;
    var top = active.offsetTop, bottom = top + active.offsetHeight;
    if (top < els.catTrack.scrollTop) els.catTrack.scrollTop = top;
    else if (bottom > els.catTrack.scrollTop + els.catTrack.clientHeight) {
      els.catTrack.scrollTop = bottom - els.catTrack.clientHeight;
    }
  }

  function selectCategory(i, keepFocus) {
    S.catIndex = Math.max(0, Math.min(i, S.cats.length - 1));
    buildView();
    if (!keepFocus) { S.focus = 0; S.scrollTop = 0; }
    if (!S.didRestore && S.cats[S.catIndex] === 'All') {
      var last = Store.getLast();
      for (var j = 0; last && j < S.view.length; j++) {
        if (S.view[j].url === last) { S.focus = j; break; }
      }
      S.didRestore = true;
    }
    renderCats(); renderList(); updatePreview();
  }

  /* ---------------- filtered view ---------------- */
  function buildView() {
    var cat = S.cats[S.catIndex];
    var q = S.query.toLowerCase();
    var out = [];
    var favs = Store.favs();
    for (var i = 0; i < S.channels.length; i++) {
      var ch = S.channels[i];
      if (cat === 'Favorites') { if (!favs[ch.url]) continue; }
      else if (cat !== 'All' && ch.group !== cat) continue;
      if (q && ch.name.toLowerCase().indexOf(q) < 0) continue;
      out.push(ch);
    }
    S.view = out;
    if (S.focus >= out.length) S.focus = Math.max(0, out.length - 1);
  }

  /* ---------------- virtualized list (pooled rows) ---------------- */
  var pool = [];
  function ensurePool(n) {
    while (pool.length < n) {
      var d = document.createElement('div');
      d.className = 'ch-item';
      d.setAttribute('role', 'option');
      d.innerHTML = '<span class="num"></span><span class="logo"></span><span class="name"></span><span class="fav">★</span>';
      d.style.position = 'absolute'; d.style.left = '0'; d.style.right = '0';
      els.track.appendChild(d); pool.push(d);
    }
  }

  function viewportH() { return els.viewport.clientHeight || 620; }

  function renderList() {
    var total = S.view.length;
    var vh = viewportH();
    var category = S.cats[S.catIndex] || 'Channels';
    els.guideMeta.textContent = total
      ? category + ' · ' + (S.focus + 1) + ' of ' + total
      : 'No channels in ' + category;
    var visible = Math.ceil(vh / ROW_H);
    var buffer = 4;
    var count = Math.min(total, visible + buffer * 2);
    ensurePool(count);

    // keep focused row comfortably in view
    var focusTop = S.focus * ROW_H;
    if (focusTop < S.scrollTop) S.scrollTop = focusTop;
    else if (focusTop + ROW_H > S.scrollTop + vh) S.scrollTop = focusTop + ROW_H - vh;
    S.scrollTop = Math.max(0, Math.min(S.scrollTop, Math.max(0, total * ROW_H - vh)));

    var start = Math.max(0, Math.floor(S.scrollTop / ROW_H) - buffer);
    if (start + count > total) start = Math.max(0, total - count);

    var favs = Store.favs();
    for (var p = 0; p < pool.length; p++) {
      var idx = start + p;
      var row = pool[p];
      if (idx >= total || p >= count) { row.style.display = 'none'; continue; }
      var ch = S.view[idx];
      row.style.display = 'flex';
      row.style.top = (idx * ROW_H) + 'px';
      row.className = 'ch-item' + (favs[ch.url] ? ' is-fav' : '') +
        (S.zone === 'list' && idx === S.focus ? ' focused' : '');
      row.setAttribute('aria-selected', idx === S.focus ? 'true' : 'false');
      row.children[0].textContent = ch.num;
      var logo = row.children[1];
      logo.style.backgroundImage = ch.logo ? ('url("' + ch.logo + '")') : 'none';
      row.children[2].textContent = ch.name;
    }
    els.track.style.transform = 'translateY(' + (-S.scrollTop) + 'px)';
    var contentH = total * ROW_H;
    var thumbH = contentH > vh ? Math.max(42, Math.round(vh * vh / contentH)) : vh;
    var thumbY = contentH > vh
      ? Math.round((vh - thumbH) * S.scrollTop / (contentH - vh))
      : 0;
    els.scrollRail.classList.toggle('hidden', contentH <= vh);
    els.scrollThumb.style.height = thumbH + 'px';
    els.scrollThumb.style.transform = 'translateY(' + thumbY + 'px)';
  }

  /* ---------------- preview / EPG ---------------- */
  function epgFor(ch) { return S.epg ? EPG.lookup(S.epg, ch.id, now()) : null; }
  // Xtream: fetch now/next per channel on demand (debounced), cache, refresh UI.
  function ensureEpg(ch) {
    if (MODE !== 'xtream' || !ch || !ch.stream_id || epgCache[ch.stream_id]) return;
    var sid = ch.stream_id;
    clearTimeout(ensureEpg._t);
    ensureEpg._t = setTimeout(function () {
      X.shortEpg(sid).then(function (e) {
        epgCache[sid] = e || {};
        var cur = S.view[S.focus];
        if (cur && cur.stream_id === sid) { updatePreview(); if (S.zone === 'player') showOSD(cur); }
      }).catch(function () { epgCache[sid] = {}; });
    }, 250);
  }
  function fmt(p) {
    if (!p) return '';
    var d = new Date(p.s), hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
    return hh + ':' + mm + '  ' + p.title;
  }
  function updatePreview() {
    var ch = S.view[S.focus];
    if (!ch) {
      els.pName.textContent = ''; els.pNow.textContent = ''; els.pNext.textContent = '';
      els.pLogo.style.backgroundImage = 'none'; els.pLogo.classList.remove('has-logo');
      els.pProgress.style.width = '0';
      return;
    }
    els.pLogo.style.backgroundImage = ch.logo ? ('url("' + ch.logo + '")') : 'none';
    els.pLogo.classList.toggle('has-logo', !!ch.logo);
    els.pName.textContent = ch.name;
    var e = (MODE === 'xtream') ? epgCache[ch.stream_id] : epgFor(ch);
    els.pNow.textContent = e && e.now ? ('NOW · ' + fmt(e.now)) : 'Live programming';
    els.pNext.textContent = e && e.next ? ('NEXT · ' + fmt(e.next)) : 'Program details unavailable';
    if (e && e.now && e.now.e > e.now.s) {
      els.pProgress.style.width = Math.max(0, Math.min(100,
        (now() - e.now.s) / (e.now.e - e.now.s) * 100)) + '%';
    } else els.pProgress.style.width = '0';
    if (MODE === 'xtream') ensureEpg(ch);
  }

  /* ---------------- playback ---------------- */
  function playFocused() {
    var ch = S.view[S.focus]; if (!ch) return;
    playChannel(ch);
  }
  function playChannel(ch) {
    S.zone = 'player';
    var url = (MODE === 'xtream' && ch.stream_id && Player.backend === 'html5')
      ? X.streamUrl(ch.stream_id, true) : ch.url;
    Store.setLast(ch.url);
    Player.play(url);
    showOSD(ch);
  }
  function zap(delta) {
    var i = S.focus + delta;
    if (i < 0 || i >= S.view.length) return;
    S.focus = i; renderList(); updatePreview();
    playChannel(S.view[i]);
  }
  function showOSD(ch) {
    els.osdLogo.style.backgroundImage = ch.logo ? ('url("' + ch.logo + '")') : 'none';
    els.osdName.textContent = ch.name;
    var e = (MODE === 'xtream') ? epgCache[ch.stream_id] : epgFor(ch);
    if (MODE === 'xtream') ensureEpg(ch);
    els.osdNow.textContent = e && e.now ? fmt(e.now) : '';
    if (e && e.now && e.now.e > e.now.s) {
      var pct = Math.max(0, Math.min(100, (now() - e.now.s) / (e.now.e - e.now.s) * 100));
      els.osdBar.style.width = pct + '%';
    } else els.osdBar.style.width = '0';
    els.osd.classList.remove('hide');
    clearTimeout(S.osdTimer);
    S.osdTimer = setTimeout(function () { els.osd.classList.add('hide'); }, 5000);
  }
  Player.on('buffering', function (b) { els.spinner.classList.toggle('hidden', !b); });
  Player.on('playing', function () { els.spinner.classList.add('hidden'); });
  Player.on('error', function (m) { els.spinner.classList.add('hidden'); toast('Playback error: ' + m); });

  function stopPlayback() {
    Player.stop();
    S.zone = 'list';
    renderList();
  }

  /* ---------------- setup screen ---------------- */
  function showSetup() {
    var cfg = Store.getConfig();
    els.cfgM3u.value = cfg.m3u || ''; els.cfgEpg.value = cfg.epg || '';
    els.cfgRelay.value = cfg.relay || Store.getRelayUrl();
    els.setup.classList.remove('hidden'); els.browser.classList.add('hidden');
    S.zone = 'setup'; S.setupFocus = 0; renderSetupFocus();
  }
  function hideSetup() { els.setup.classList.add('hidden'); els.browser.classList.remove('hidden'); S.zone = 'list'; }
  var setupEls = function () { return [els.cfgM3u, els.cfgEpg, els.cfgRelay, els.cfgSave]; };
  function renderSetupFocus() {
    var e = setupEls();
    e.forEach(function (el, i) { el.classList.toggle('focused', i === S.setupFocus); });
    if (S.setupFocus < 3) e[S.setupFocus].focus();
  }
  function saveSetup() {
    var url = els.cfgM3u.value.trim();
    if (!url) { els.setupStatus.textContent = 'Enter a playlist or Xtream URL.'; return; }
    var epg = els.cfgEpg.value.trim();
    var relay = els.cfgRelay.value.trim().replace(/\/+$/, '');
    var xc = Xtream.parse(url); // any get.php / xmltv.php / player_api.php with user+pass -> Xtream API
    if (xc) Store.setConfig({ type: 'xtream', base: xc.base, user: xc.user, pass: xc.pass, epg: epg, relay: relay });
    else Store.setConfig({ type: 'm3u', m3u: url, epg: epg, relay: relay });
    els.setupStatus.textContent = 'Saved. Loading…';
    hideSetup(); refreshPlaylist(false);
  }

  function returnToTizenBrew() {
    if (!Store.isTizenBrew()) return false;
    history.back();
    return true;
  }

  /* ---------------- key handling ---------------- */
  function onKey(e) {
    var k = e.keyCode;
    // Esc -> Return/Back, F -> RED, S -> GREEN, / -> YELLOW (search).
    if (k === 27) k = KEY.RETURN;
    else if (k === 70) k = KEY.RED;
    else if (k === 83) k = KEY.GREEN;
    else if (k === 191) k = KEY.YELLOW;
    if (S.zone === 'setup') return setupKey(k, e);
    if (S.zone === 'player') return playerKey(k, e);
    if (S.zone === 'search') return searchKey(k, e);
    // browser zones
    if (k === KEY.RETURN) { e.preventDefault(); returnToTizenBrew(); return; }
    if (k === KEY.UP) return move(-1, e);
    if (k === KEY.DOWN) return move(1, e);
    if (k === KEY.LEFT) return zoneLeft(e);
    if (k === KEY.RIGHT) return zoneRight(e);
    if (k === KEY.ENTER) return enter(e);
    if (k === KEY.RED) { e.preventDefault(); toggleFav(); }
    if (k === KEY.GREEN) { e.preventDefault(); showSetup(); }
    if (k === KEY.YELLOW) { e.preventDefault(); openSearch(); }
  }

  function move(d, e) {
    e.preventDefault();
    if (S.zone === 'cats') { selectCategory(S.catIndex + d, false); }
    else if (S.zone === 'list') {
      S.focus = Math.max(0, Math.min(S.focus + d, S.view.length - 1));
      renderList(); updatePreview();
    }
  }
  function zoneLeft(e) {
    e.preventDefault();
    if (S.zone === 'list') { S.zone = 'cats'; renderCats(); renderList(); }
  }
  function zoneRight(e) {
    e.preventDefault();
    if (S.zone === 'cats') { S.zone = 'list'; renderCats(); renderList(); }
  }
  function enter(e) {
    e.preventDefault();
    if (S.zone === 'cats') { S.zone = 'list'; renderCats(); renderList(); }
    else if (S.zone === 'list') playFocused();
  }
  function toggleFav() {
    var ch = S.view[S.focus]; if (!ch) return;
    Store.toggleFav(ch.url);
    if (S.cats[S.catIndex] === 'Favorites') { buildView(); }
    renderCats(); renderList();
  }

  function applySearch() {
    S.query = els.search.value.trim();
    S.focus = 0; S.scrollTop = 0;
    buildView(); renderList(); updatePreview();
  }
  function openSearch() {
    S.zone = 'search';
    els.search.removeAttribute('readonly');
    els.search.classList.add('focused');
    els.search.focus();
    renderCats(); renderList();
  }
  function closeSearch() {
    els.search.setAttribute('readonly', 'readonly');
    els.search.classList.remove('focused');
    els.search.blur();
    S.zone = 'list';
    renderCats(); renderList(); updatePreview();
  }
  function searchKey(k, e) {
    if (k === KEY.RETURN || k === KEY.YELLOW) {
      e.preventDefault(); closeSearch(); return;
    }
    if (k === KEY.DOWN || k === KEY.ENTER) {
      e.preventDefault(); closeSearch();
    }
  }

  function playerKey(k, e) {
    e.preventDefault();
    if (k === KEY.RETURN || k === KEY.STOP) return stopPlayback();
    if (k === KEY.UP || k === KEY.CH_UP) return zap(-1);
    if (k === KEY.DOWN || k === KEY.CH_DOWN) return zap(1);
    if (k === KEY.ENTER || k === KEY.INFO) return showOSD(S.view[S.focus]);
  }

  function setupKey(k, e) {
    if (k === KEY.UP) { e.preventDefault(); S.setupFocus = Math.max(0, S.setupFocus - 1); renderSetupFocus(); }
    else if (k === KEY.DOWN) { e.preventDefault(); S.setupFocus = Math.min(3, S.setupFocus + 1); renderSetupFocus(); }
    else if (k === KEY.ENTER) {
      if (S.setupFocus === 3) { e.preventDefault(); saveSetup(); }
    } else if (k === KEY.RETURN) {
      e.preventDefault();
      if (S.channels.length) hideSetup();
      else returnToTizenBrew();
    }
  }

  /* ---------------- utils ---------------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ---------------- boot ---------------- */
  function boot() {
    NAV.registerKeys();
    document.addEventListener('keydown', onKey);
    els.cfgSave.addEventListener('click', saveSetup);
    els.search.addEventListener('input', applySearch);
    window.addEventListener('resize', renderList);
    setClock();
    setInterval(setClock, 30000);
    var cfg = Store.getConfig();
    if (cfg.type === 'xtream') { MODE = 'xtream'; X = new Xtream({ base: cfg.base, user: cfg.user, pass: cfg.pass }); }

    var haveCache = loadFromCache();
    if (haveCache) {
      selectCategory(0, false); renderCats();
      // refresh in background if stale
      if (Store.isStale(REFRESH_MS)) refreshPlaylist(true);
      else {
        syncRemote();
        if (MODE !== 'xtream' && cfg.epg) { httpText(cfg.epg).then(function (t) { S.epg = EPG.parse(t); updatePreview(); }).catch(function () {}); }
      }
    } else {
      if (cfg.type === 'xtream' || cfg.m3u) refreshPlaylist(false); else showSetup();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
