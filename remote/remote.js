(function () {
  'use strict';

  var TOKEN_KEY = 'smart-iptv.remote-token';
  var state = { token: readToken(), catalog: [], group: '', query: '', selectedKey: '' };
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    shell: $('remote-shell'), badge: $('connection-badge'), label: $('connection-label'), pairPanel: $('pairing-panel'), pairForm: $('pairing-form'), code: $('room-code'), pairButton: $('pair-button'), pairStatus: $('pairing-status'), nowPanel: $('now-panel'), nowTitle: $('now-playing-title'), nowMeta: $('now-playing-meta'), stop: $('stop-button'), channelPanel: $('channel-panel'), count: $('channel-count'), search: $('channel-search'), filters: $('group-filters'), loading: $('catalog-loading'), empty: $('catalog-empty'), error: $('catalog-error'), errorMessage: $('catalog-error-message'), retry: $('retry-catalog'), list: $('channel-list'), pairAnother: $('pair-another')
  };

  function relayUrl() { return (location.protocol === 'http:' || location.protocol === 'https:') ? location.origin : ''; }
  function readToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function saveToken(token) { try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function visible(element, isVisible) {
    element.hidden = !isVisible;
    element.style.display = isVisible ? '' : 'none';
  }
  function setStopEnabled(isEnabled) {
    els.stop.disabled = !isEnabled;
    els.stop.className = 'remote-action remote-action--' + (isEnabled ? 'primary' : 'secondary');
  }

  function request(method, path, token, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, relayUrl() + path, true);
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

  function setConnection(text, paired) {
    els.label.textContent = text;
    els.badge.classList.toggle('status-badge--paired', paired);
    els.badge.classList.toggle('status-badge--connecting', !paired);
  }

  function catalogEntries() {
    var query = state.query.toLowerCase();
    return state.catalog.filter(function (channel) {
      var inGroup = !state.group || channel.group === state.group;
      var haystack = (channel.number + ' ' + channel.name + ' ' + channel.group).toLowerCase();
      return inGroup && (!query || haystack.indexOf(query) !== -1);
    });
  }

  function renderFilters() {
    var groups = [], seen = {};
    state.catalog.forEach(function (channel) {
      if (channel.group && !seen[channel.group]) { seen[channel.group] = true; groups.push(channel.group); }
    });
    els.filters.textContent = '';
    [{ name: 'All channels', group: '' }].concat(groups.map(function (group) { return { name: group, group: group }; })).forEach(function (filter) {
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'filter-chip'; button.textContent = filter.name;
      button.setAttribute('aria-pressed', String(state.group === filter.group));
      button.addEventListener('click', function () { state.group = filter.group; renderFilters(); renderCatalog(); });
      els.filters.appendChild(button);
    });
  }

  function renderCatalog() {
    var entries = catalogEntries();
    els.list.textContent = '';
    visible(els.empty, !entries.length);
    entries.forEach(function (channel) {
      var row = document.createElement('button');
      var number = document.createElement('span');
      var copy = document.createElement('span');
      var name = document.createElement('strong');
      var group = document.createElement('small');
      var channelState = document.createElement('span');
      row.type = 'button'; row.className = 'channel-row' + (state.selectedKey === channel.key ? ' channel-row--selected' : '');
      row.setAttribute('aria-pressed', String(state.selectedKey === channel.key));
      row.setAttribute('aria-label', 'Play ' + channel.number + ' ' + channel.name + ', ' + channel.group);
      number.className = 'channel-number'; number.textContent = channel.number;
      copy.className = 'channel-copy'; name.textContent = channel.name; group.textContent = channel.group;
      channelState.className = 'channel-state'; channelState.textContent = state.selectedKey === channel.key ? 'On now' : 'Play';
      copy.appendChild(name); copy.appendChild(group); row.appendChild(number); row.appendChild(copy); row.appendChild(channelState);
      row.addEventListener('click', function () { sendCommand({ command: 'play', key: channel.key }, channel); });
      els.list.appendChild(row);
    });
  }

  function showPaired() {
    visible(els.pairPanel, false); visible(els.nowPanel, true); visible(els.channelPanel, true);
    els.shell.classList.add('is-paired'); setConnection('TV paired', true); setStopEnabled(!!state.selectedKey);
  }

  function showPairing(message) {
    visible(els.pairPanel, true); visible(els.nowPanel, false); visible(els.channelPanel, false);
    els.shell.classList.remove('is-paired'); setConnection('Not paired', false); els.pairStatus.textContent = message || '';
    els.code.focus();
  }

  function setLoading(isLoading) { visible(els.loading, isLoading); visible(els.error, false); }

  function loadCatalog() {
    if (!state.token) { showPairing(); return; }
    showPaired(); setLoading(true); els.list.textContent = '';
    request('GET', '/api/remote/catalog', state.token).then(function (response) {
      setLoading(false);
      if (!response || !Array.isArray(response.catalog)) throw new Error('invalid catalog');
      state.catalog = response.catalog;
      els.count.textContent = state.catalog.length + (state.catalog.length === 1 ? ' channel' : ' channels');
      renderFilters(); renderCatalog();
    }).catch(function (error) {
      setLoading(false);
      if (error.status === 401) {
        state.token = ''; clearToken(); showPairing('That pairing has expired. Enter the code shown on the TV.');
        return;
      }
      visible(els.error, true);
    });
  }

  function pair() {
    var code = els.code.value.replace(/\s/g, '');
    if (!code) { els.pairStatus.textContent = 'Enter the code shown on the TV.'; els.code.focus(); return; }
    els.pairButton.disabled = true; els.pairStatus.textContent = 'Pairing with the TV…';
    request('POST', '/api/remote/pair', '', { pairing_code: code }).then(function (response) {
      if (!response || !response.remote_token) throw new Error('invalid pairing');
      state.token = response.remote_token; saveToken(state.token); els.pairButton.disabled = false; loadCatalog();
    }).catch(function () {
      els.pairButton.disabled = false; els.pairStatus.textContent = 'That code was not accepted. Check the TV and try again.';
    });
  }

  function sendCommand(command, channel) {
    request('POST', '/api/remote/commands', state.token, command).then(function () {
      if (command.command === 'play') {
        state.selectedKey = channel.key; els.nowTitle.textContent = channel.name; els.nowMeta.textContent = channel.number + ' · ' + channel.group; setStopEnabled(true);
      } else {
        state.selectedKey = ''; els.nowTitle.textContent = 'Playback stopped'; els.nowMeta.textContent = 'Choose a channel below'; setStopEnabled(false);
      }
      renderCatalog();
    }).catch(function (error) {
      if (error.status === 401) { state.token = ''; clearToken(); showPairing('That pairing has expired. Enter the code shown on the TV.'); return; }
      visible(els.error, true);
    });
  }

  els.pairForm.addEventListener('submit', function (event) { event.preventDefault(); pair(); });
  els.search.addEventListener('input', function () { state.query = els.search.value; renderCatalog(); });
  els.stop.addEventListener('click', function () { sendCommand({ command: 'stop' }); });
  els.retry.addEventListener('click', loadCatalog);
  els.pairAnother.addEventListener('click', function () { state.token = ''; state.catalog = []; state.selectedKey = ''; clearToken(); showPairing('Enter the new TV code.'); });

  if (state.token) loadCatalog(); else showPairing();
})();
