/* store.js — settings, favorites, and a cached parsed playlist for instant startup.
   The biggest startup win: we parse the M3U once, cache the compact result, and on
   next launch render from cache immediately while refreshing in the background. */
(function (g) {
  var K = {
    CFG: 'iptv.cfg',          // {m3u, epg}
    CHANNELS: 'iptv.channels',// parsed [{id,name,logo,group,url,num}]
    CATS: 'iptv.cats',        // ["All","Sports",...]
    STAMP: 'iptv.stamp',      // last refresh epoch ms
    FAVS: 'iptv.favs',        // {url:true}
    LAST: 'iptv.last'         // last watched url
  };

  function read(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var Store = {
    getConfig: function () { return read(K.CFG, { m3u: '', epg: '' }); },
    setConfig: function (c) { write(K.CFG, c); },

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
    setLast: function (url) { write(K.LAST, url); }
  };

  // Date.now is fine in-app on the device; isolated here so it's easy to reason about.
  function nowMs() { return (new Date()).getTime(); }

  g.Store = Store;
})(window);
