/* xtream.js — Xtream Codes API client.
   Avoids the giant get.php M3U entirely: fetches categories + streams via
   player_api.php and builds stream URLs directly. Works with a direct provider
   base (on the TV) or a same-origin proxy base (for browser preview / CORS). */
(function (g) {
  'use strict';

  function b64(s) {
    if (!s) return '';
    try { return decodeURIComponent(escape(atob(s))); }
    catch (e) { try { return atob(s); } catch (_) { return s; } }
  }

  function getJSON(url) {
    if (g.fetch) {
      return g.fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    }
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      x.open('GET', url, true); x.timeout = 60000;
      x.onload = function () { try { res(JSON.parse(x.responseText)); } catch (e) { rej(e); } };
      x.onerror = function () { rej(new Error('network')); };
      x.ontimeout = function () { rej(new Error('timeout')); };
      x.send();
    });
  }

  // Parse any provider URL (get.php / xmltv.php / player_api.php) -> {base,user,pass}
  function parse(url) {
    var m = /^(https?:)\/\/([^\/:]+)(?::(\d+))?/i.exec(url);
    if (!m) return null;
    var port = m[3] || (m[1] === 'https:' ? '443' : '80');
    var qs = {};
    (url.split('?')[1] || '').split('&').forEach(function (kv) {
      var p = kv.split('='); qs[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    if (!qs.username || !qs.password) return null;
    return { base: m[1] + '//' + m[2] + ':' + port, user: qs.username, pass: qs.password };
  }

  function Xtream(cfg) {
    // cfg.base may be a direct provider origin OR a proxy prefix (e.g. ".../prov")
    this.base = cfg.base.replace(/\/$/, '');
    this.user = cfg.user; this.pass = cfg.pass;
  }
  Xtream.prototype.api = function (action, extra) {
    var u = this.base + '/player_api.php?username=' + encodeURIComponent(this.user) +
      '&password=' + encodeURIComponent(this.pass) + '&action=' + action + (extra || '');
    return getJSON(u);
  };
  Xtream.prototype.accountInfo = function () { return this.api(''); };
  Xtream.prototype.liveCategories = function () { return this.api('get_live_categories'); };
  Xtream.prototype.liveStreams = function (catId) { return this.api('get_live_streams', catId != null ? '&category_id=' + catId : ''); };
  Xtream.prototype.streamUrl = function (id, hls) {
    return hls ? this.base + '/live/' + this.user + '/' + this.pass + '/' + id + '.m3u8'
               : this.base + '/live/' + this.user + '/' + this.pass + '/' + id + '.ts';
  };
  // now/next for a live stream id; resolves {now,next} or null
  Xtream.prototype.shortEpg = function (streamId) {
    return this.api('get_short_epg', '&stream_id=' + streamId + '&limit=6').then(function (d) {
      var list = (d && d.epg_listings) || [];
      var now = Date.now() / 1000, cur = null, nxt = null;
      for (var i = 0; i < list.length; i++) {
        var s = +list[i].start_timestamp, e = +list[i].stop_timestamp;
        var item = { s: s * 1000, e: e * 1000, title: b64(list[i].title) };
        if (now >= s && now < e) { cur = item; nxt = list[i + 1] ? { s: +list[i + 1].start_timestamp * 1000, e: +list[i + 1].stop_timestamp * 1000, title: b64(list[i + 1].title) } : null; break; }
        if (now < s) { nxt = nxt || item; }
      }
      return { now: cur, next: nxt };
    });
  };

  g.Xtream = Xtream;
  g.Xtream.parse = parse;
})(window);
