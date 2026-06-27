/* epg.js — minimal XMLTV parser + now/next lookup.
   Regex-based (no DOM) so large guides don't blow up TV memory.
   Builds { channelId -> [ {s,e,title}, ... ] } sorted by start. */
(function (g) {

  // XMLTV time: "20240131203000 +0000" -> epoch ms
  function xmltvTime(t) {
    if (!t) return 0;
    var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(t);
    if (!m) return 0;
    var d = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    if (m[7]) { // apply tz offset
      var sign = m[7][0] === '-' ? 1 : -1;
      var oh = +m[7].slice(1, 3), om = +m[7].slice(3, 5);
      d += sign * (oh * 60 + om) * 60000;
    }
    return d;
  }

  var PROG = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  var A = function (attrs, name) { var m = new RegExp(name + '="([^"]*)"').exec(attrs); return m ? m[1] : ''; };
  var TITLE = /<title[^>]*>([\s\S]*?)<\/title>/;

  function decode(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
  }

  function parse(text) {
    var map = Object.create(null);
    var m;
    PROG.lastIndex = 0;
    while ((m = PROG.exec(text))) {
      var attrs = m[1], body = m[2];
      var ch = A(attrs, 'channel'); if (!ch) continue;
      var tm = TITLE.exec(body);
      (map[ch] || (map[ch] = [])).push({
        s: xmltvTime(A(attrs, 'start')),
        e: xmltvTime(A(attrs, 'stop')),
        title: tm ? decode(tm[1]) : ''
      });
    }
    for (var k in map) map[k].sort(function (a, b) { return a.s - b.s; });
    return map;
  }

  // returns {now, next} programmes for a channel id at time t(ms)
  function lookup(map, id, t) {
    var arr = id && map[id]; if (!arr) return null;
    for (var i = 0; i < arr.length; i++) {
      if (t < arr[i].e) {
        if (t >= arr[i].s) return { now: arr[i], next: arr[i + 1] || null };
        return { now: null, next: arr[i] };
      }
    }
    return null;
  }

  g.EPG = { parse: parse, lookup: lookup };
})(window);
