(function (g) {
  'use strict';

  function request(method, url, token, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.timeout = 10000;
      xhr.setRequestHeader('Accept', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      if (body) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        var response = null;
        try { response = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(response);
        else reject({ status: xhr.status });
      };
      xhr.onerror = xhr.ontimeout = function () { reject({ status: 0 }); };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }

  function hash(value) {
    var result = 2166136261;
    for (var i = 0; i < value.length; i++) {
      result ^= value.charCodeAt(i);
      result += (result << 1) + (result << 4) + (result << 7) + (result << 8) + (result << 24);
    }
    return (result >>> 0).toString(36);
  }

  function catalogFor(channels) {
    var catalog = [], byKey = {}, duplicates = {};
    for (var i = 0; i < channels.length; i++) {
      var channel = channels[i];
      var basis = String(channel.num || '') + '\u0000' + String(channel.name || '') + '\u0000' + String(channel.group || '');
      var baseKey = 'c' + hash(basis);
      var count = (duplicates[baseKey] || 0) + 1;
      duplicates[baseKey] = count;
      var key = count === 1 ? baseKey : baseKey + '-' + count;
      var entry = { key: key, number: String(channel.num || ''), name: String(channel.name || ''), group: String(channel.group || '') };
      catalog.push(entry);
      byKey[key] = channel;
    }
    return { catalog: catalog, byKey: byKey, signature: JSON.stringify(catalog) };
  }

  function create(options) {
    var state = { channels: [], catalog: null, session: null, timer: 0, polling: false, registering: false };

    function status(message) { options.onStatus(message); }
    function stopPolling() { clearTimeout(state.timer); state.timer = 0; }
    function schedule(action, delay) { stopPolling(); state.timer = setTimeout(action, delay); }
    function schedulePoll(delay) { schedule(poll, delay); }
    function currentRelay() { return String(options.getRelayUrl() || '').replace(/\/+$/, ''); }

    function register() {
      if (state.registering || !state.catalog) return;
      var relay = currentRelay();
      if (!relay) { status('Set the relay URL in TV settings to pair a phone.'); return; }
      state.registering = true;
      status('Preparing phone pairing…');
      request('POST', relay + '/api/tvs', '', { name: options.name, catalog: state.catalog.catalog }).then(function (response) {
        state.registering = false;
        if (!response || !response.tv_token || !response.pairing_code) throw new Error('invalid registration');
        state.session = {
          relayUrl: relay,
          tvToken: response.tv_token,
          pairingCode: response.pairing_code,
          catalogSignature: state.catalog.signature
        };
        Store.setRemoteTV(state.session);
        status('Phone pairing code: ' + response.pairing_code);
        schedulePoll(1000);
      }).catch(function () {
        state.registering = false;
        status('Phone relay unavailable. Retrying…');
        schedule(register, 5000);
      });
    }

    function updateCatalog() {
      var session = state.session;
      if (!session || !state.catalog) return;
      status('Refreshing phone channel guide…');
      request('PUT', session.relayUrl + '/api/tvs/catalog', session.tvToken, { catalog: state.catalog.catalog }).then(function () {
        session.catalogSignature = state.catalog.signature;
        Store.setRemoteTV(session);
        status(session.pairingCode ? 'Phone pairing code: ' + session.pairingCode : 'Phone remote ready.');
        schedulePoll(1000);
      }).catch(function (error) {
        if (error.status === 401) {
          Store.clearRemoteTV();
          state.session = null;
          register();
          return;
        }
        status('Phone relay unavailable. Retrying…');
        schedule(updateCatalog, 5000);
      });
    }

    function poll() {
      var session = state.session;
      if (!session || state.polling) return;
      state.polling = true;
      request('GET', session.relayUrl + '/api/tv/commands/next', session.tvToken).then(function (response) {
        state.polling = false;
        var pairingCode = response && response.pairing_code;
        if (pairingCode && pairingCode !== session.pairingCode) {
          session.pairingCode = pairingCode;
          Store.setRemoteTV(session);
          status('Phone pairing code: ' + pairingCode);
        }
        var command = response && response.command;
        if (command && command.command === 'play' && state.catalog.byKey[command.key]) options.onPlay(state.catalog.byKey[command.key]);
        if (command && command.command === 'stop') options.onStop();
        schedulePoll(1000);
      }).catch(function (error) {
        state.polling = false;
        if (error.status === 401) {
          Store.clearRemoteTV();
          state.session = null;
          register();
          return;
        }
        status('Phone relay unavailable. Retrying…');
        schedulePoll(5000);
      });
    }

    function sync(channels) {
      state.channels = channels || [];
      state.catalog = catalogFor(state.channels);
      if (!state.catalog.catalog.length) { stopPolling(); status('Phone remote waits for channels.'); return; }
      var relay = currentRelay();
      var saved = Store.getRemoteTV();
      if (saved && saved.relayUrl === relay && saved.tvToken) {
        state.session = saved;
        if (saved.catalogSignature === state.catalog.signature) {
          status(saved.pairingCode ? 'Phone pairing code: ' + saved.pairingCode : 'Phone remote ready.');
          schedulePoll(1000);
        } else updateCatalog();
      } else {
        stopPolling();
        Store.clearRemoteTV();
        state.session = null;
        register();
      }
    }

    return { sync: sync, stop: stopPolling };
  }

  g.RemoteBridge = { create: create };
})(window);
