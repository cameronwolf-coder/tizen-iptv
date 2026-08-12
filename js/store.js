/* store.js — settings, favorites, and a cached parsed playlist for instant startup.
   The biggest startup win: we parse the M3U once, cache the compact result, and on
   next launch render from cache immediately while refreshing in the background. */
(function (g) {
  var K = {
    CFG: 'wolf-tv.cfg',          // {m3u, epg, relay}
    CHANNELS: 'wolf-tv.channels',// parsed [{id,name,logo,group,url,num}]
    CATS: 'wolf-tv.cats',        // ["All","Sports",...]
    STAMP: 'wolf-tv.stamp',      // last refresh epoch ms
    FAVS: 'wolf-tv.favs',        // {url:true}
    LAST: 'wolf-tv.last',        // last watched url
    REMOTE_TV: 'wolf-tv.remoteTv'
  };

  function read(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function isTizenBrew() {
    return location.protocol === 'http:' &&
      location.hostname === '127.0.0.1' &&
      location.port === '8081' &&
      location.pathname.indexOf('/module/') === 0;
  }
  function defaultRelayUrl() {
    if (isTizenBrew()) return '';
    return (location.protocol === 'http:' || location.protocol === 'https:') ? location.origin : '';
  }
  function relayUrl(value) { return String(value || '').replace(/\/+$/, ''); }

  var Store = {
    getConfig: function () { return read(K.CFG, { m3u: '', epg: '' }); },
    setConfig: function (c) { write(K.CFG, c); },
    getRelayUrl: function () {
      var cfg = this.getConfig();
      return relayUrl(cfg.relay || defaultRelayUrl());
    },
    isTizenBrew: isTizenBrew,

    getCachedPlaylist: function () {
      var ch = read(K.CHANNELS, null);
      if (!ch) return null;
      return { channels: ch, cats: read(K.CATS, ['All']), stamp: read(K.STAMP, 0) };
    },
    savePlaylist: function (channels, cats, stampMs) {
      // Channels can be huge; store compact and guard quota.
      var okA = write(K.CHANNELS, channels);
      write(K.CATS, cats);
      write(K.STAMP, stampMs || 0);
      return okA;
    },
    isStale: function (maxAgeMs) {
      var s = read(K.STAMP, 0);
      return !s || (nowMs() - s) > maxAgeMs;
    },

    favs: function () { return read(K.FAVS, {}); },
    isFav: function (url) { return !!read(K.FAVS, {})[url]; },
    toggleFav: function (url) {
      var f = read(K.FAVS, {});
      if (f[url]) delete f[url]; else f[url] = 1;
      write(K.FAVS, f); return !!f[url];
    },

    getLast: function () { return read(K.LAST, null); },
    setLast: function (url) { write(K.LAST, url); },

    getRemoteTV: function () { return read(K.REMOTE_TV, null); },
    setRemoteTV: function (session) { return write(K.REMOTE_TV, session); },
    clearRemoteTV: function () { try { localStorage.removeItem(K.REMOTE_TV); } catch (e) {} }
  };

  // Date.now is fine in-app on the device; isolated here so it's easy to reason about.
  function nowMs() { return (new Date()).getTime(); }

  g.Store = Store;
})(window);
