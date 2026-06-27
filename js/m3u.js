/* m3u.js — fast, allocation-light M3U / M3U-plus parser.
   Handles #EXTINF lines with tvg-id, tvg-name, tvg-logo, group-title.
   Designed to chew through 10k+ entries without choking the TV. */
(function (g) {

  var ATTR = /([a-zA-Z0-9_-]+)="([^"]*)"/g;

  function parseExtinf(line) {
    // line: #EXTINF:-1 tvg-id="x" tvg-logo="y" group-title="z",Display Name
    var comma = line.lastIndexOf(',');
    var name = comma >= 0 ? line.slice(comma + 1).trim() : '';
    var attrs = {};
    var meta = comma >= 0 ? line.slice(0, comma) : line;
    var m;
    ATTR.lastIndex = 0;
    while ((m = ATTR.exec(meta))) attrs[m[1].toLowerCase()] = m[2];
    return { name: name, attrs: attrs };
  }

  // text -> { channels:[...], cats:[...] }
  function parse(text) {
    var lines = text.split(/\r?\n/);
    var channels = [];
    var catSet = Object.create(null);
    var pending = null;
    var num = 0;

    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln) continue;
      var c0 = ln.charCodeAt(0);
      if (c0 === 35 /* # */) {
        if (ln.lastIndexOf('#EXTINF', 0) === 0) {
          pending = parseExtinf(ln);
        }
        // ignore other #EXT tags (#EXTM3U, #EXTVLCOPT, #EXTGRP handled below)
        else if (ln.lastIndexOf('#EXTGRP', 0) === 0 && pending) {
          pending.attrs['group-title'] = ln.slice(8).trim();
        }
        continue;
      }
      // a URL line — finalize the pending entry
      var url = ln.trim();
      if (!url) continue;
      var a = pending ? pending.attrs : {};
      var group = a['group-title'] || 'Uncategorized';
      catSet[group] = (catSet[group] | 0) + 1;
      channels.push({
        num: ++num,
        id: a['tvg-id'] || '',
        name: (pending && pending.name) || a['tvg-name'] || ('Channel ' + num),
        logo: a['tvg-logo'] || '',
        group: group,
        url: url
      });
      pending = null;
    }

    var cats = Object.keys(catSet).sort(function (x, y) { return x.localeCompare(y); });
    cats.unshift('All');
    return { channels: channels, cats: cats, counts: catSet };
  }

  g.M3U = { parse: parse };
})(window);
