/* nav.js — Samsung TV remote key codes + registration.
   Some keys (RETURN, color, media) must be registered via tvinputdevice or they
   never reach the page. We register defensively; harmless in a desktop browser. */
(function (g) {
  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    RETURN: 10009, BACK: 10009, EXIT: 10182,
    CH_UP: 427, CH_DOWN: 428,
    PLAY: 415, PAUSE: 19, STOP: 413, PLAYPAUSE: 10252,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
    INFO: 457, MEDIA_FF: 417, MEDIA_RW: 412
  };

  function registerKeys() {
    try {
      if (!g.tizen || !tizen.tvinputdevice) return;
      ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
       'ChannelUp', 'ChannelDown', 'MediaPlayPause', 'MediaPlay', 'MediaPause',
       'MediaStop', 'MediaFastForward', 'MediaRewind', 'Info'].forEach(function (k) {
        try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
      });
    } catch (e) {}
  }

  g.NAV = { KEY: KEY, registerKeys: registerKeys };
})(window);
