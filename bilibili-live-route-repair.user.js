// ==UserScript==
// @name         B站海外直播线路修复
// @namespace    https://github.com/Linwj0207/bilibili-live-route-repair
// @version      0.3.0
// @description  优先使用 B站接口当次提供的官方 FLV 直播线路，保留该线路原有画质、编码与播放地址；不保证所有网络适用。
// @match        https://live.bilibili.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @sandbox      raw
// @author       Linwj0207
// @homepageURL  https://github.com/Linwj0207/bilibili-live-route-repair
// @supportURL   https://github.com/Linwj0207/bilibili-live-route-repair/issues
// @downloadURL  https://raw.githubusercontent.com/Linwj0207/bilibili-live-route-repair/main/bilibili-live-route-repair.user.js
// @updateURL    https://raw.githubusercontent.com/Linwj0207/bilibili-live-route-repair/main/bilibili-live-route-repair.user.js
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';
  const LIVE_ORIGIN = 'https://live.bilibili.com';
  function isLiveContext() {
    if (location.hostname === 'live.bilibili.com') return true;
    // The event page can create a same-origin blank iframe, then write the live
    // player document into it. Hook that window before its playback code runs.
    if (location.href !== 'about:blank' && location.href !== 'about:srcdoc') return false;
    try { return window.parent !== window && window.parent.location.hostname === 'live.bilibili.com'; }
    catch { return false; }
  }
  if (!isLiveContext()) return;
  const FLAG = '__biliLiveRouteRepairV1';
  if (window[FLAG]) return;
  const stats = { version: '0.3.0', apiResponsesChanged: 0, embeddedResponsesChanged: 0 };
  Object.defineProperty(window, FLAG, { value: Object.freeze({ status: () => ({ ...stats }) }) });

  const CHANNEL = 'bili-live-route-repair-v1';
  let badge;
  let badgeTimer;
  let changesSeen = 0;
  function showStatus() {
    if (window !== window.top || !document.body) return;
    badge ||= Object.assign(document.createElement('div'), { id: 'bili-live-route-repair-status' });
    badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483646;padding:7px 11px;border-radius:6px;background:#18242ee8;color:#fff;font:12px/1.5 sans-serif;pointer-events:none;max-width:260px;';
    badge.textContent = changesSeen ? '直播线路修复 0.3：已选用官方 FLV 线路' : '直播线路修复 0.3：等待直播播放地址';
    if (!badge.isConnected) document.body.append(badge);
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => badge.remove(), 18000);
  }
  function reportChange(kind) {
    stats[kind] += 1;
    changesSeen += 1;
    if (window === window.top) showStatus();
    else {
      try { window.top.postMessage({ channel: CHANNEL, changed: true }, LIVE_ORIGIN); } catch {}
    }
  }
  if (window === window.top) {
    window.addEventListener('message', event => {
      if (event.origin === LIVE_ORIGIN && event.data?.channel === CHANNEL && event.data.changed === true) {
        changesSeen += 1;
        showStatus();
      }
    });
    if (document.body) showStatus();
    else document.addEventListener('DOMContentLoaded', showStatus, { once: true });
  }

  function isPlayInfoUrl(value) {
    try {
      const url = new URL(String(value), document.baseURI || location.href);
      return url.protocol === 'https:' && url.hostname === 'api.live.bilibili.com'
        && /^\/xlive\/web-room\/v\d+\/index\/getRoomPlayInfo$/.test(url.pathname);
    } catch { return false; }
  }

  function mediaHost(info) {
    try {
      const host = new URL(info.host);
      if (host.protocol !== 'https:' || host.username || host.password || host.pathname !== '/' || host.search || host.hash) return '';
      return host.hostname;
    } catch { return ''; }
  }

  function usableFlvCodec(codec) {
    return codec?.codec_name === 'avc' && typeof codec.base_url === 'string'
      && codec.base_url.startsWith('/live-bvc/') && Array.isArray(codec.url_info)
      && codec.url_info.length > 0 && codec.url_info.every(info =>
        /(^|\.)bilivideo\.(com|cn|net)$/.test(mediaHost(info)) && typeof info.extra === 'string');
  }

  function preferNativeFlv(payload) {
    const playurl = payload?.data?.playurl_info?.playurl
      || payload?.result?.playurl_info?.playurl || payload?.playurl_info?.playurl;
    if (!playurl || !Array.isArray(playurl.stream) || (payload.code != null && payload.code !== 0)) return false;
    const selected = [];
    for (const stream of playurl.stream) {
      if (stream?.protocol_name !== 'http_stream' || !Array.isArray(stream.format)) continue;
      const formats = stream.format.filter(format => format?.format_name === 'flv'
        && Array.isArray(format.codec) && format.codec.some(usableFlvCodec));
      if (formats.length) selected.push(formats.length === stream.format.length ? stream : { ...stream, format: formats });
    }
    // Select the stream returned for this request. Keep its codecs, quality choices,
    // URLs and signatures intact; do not manufacture or pin a replacement CDN.
    if (!selected.length || (selected.length === playurl.stream.length
      && selected.every((stream, index) => stream === playurl.stream[index]))) return false;
    playurl.stream = selected;
    return true;
  }

  function patchText(raw) {
    if (typeof raw !== 'string' || raw.length > 2 * 1024 * 1024) return null;
    try {
      const payload = JSON.parse(raw);
      if (!preferNativeFlv(payload)) return null;
      return { text: JSON.stringify(payload), json: payload };
    } catch { return null; }
  }

  // Some live pages embed the first play-info response instead of fetching it later.
  function patchEmbedded(value, depth = 0, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || depth > 6 || seen.has(value)) return;
    seen.add(value);
    if (preferNativeFlv(value)) reportChange('embeddedResponsesChanged');
    if (Array.isArray(value)) return;
    for (const key of Object.keys(value)) {
      if (/play|room|data|result|res|info/i.test(key)) patchEmbedded(value[key], depth + 1, seen);
    }
  }
  for (const key of ['__NEPTUNE_IS_MY_WAIFU__', '__INITIAL_STATE__']) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, key);
      if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) {
        if ('value' in descriptor) patchEmbedded(descriptor.value);
        continue;
      }
      let stored = descriptor?.value;
      patchEmbedded(stored);
      Object.defineProperty(window, key, {
        configurable: true, enumerable: descriptor?.enumerable ?? true,
        get: () => stored,
        set: value => { stored = value; try { patchEmbedded(value); } catch {} }
      });
    } catch {}
  }

  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
      const sourceUrl = input instanceof Request ? input.url : String(input);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method !== 'GET' || !isPlayInfoUrl(sourceUrl)) return Reflect.apply(originalFetch, this, [input, init]);
      const response = await Reflect.apply(originalFetch, this, [input, init]);
      if (!response.ok) return response;
      try {
        const patch = patchText(await response.clone().text());
        if (!patch) return response;
        const headers = new Headers(response.headers);
        for (const key of ['content-length', 'content-encoding', 'etag', 'content-md5', 'digest']) headers.delete(key);
        const changed = new Response(patch.text, { status: response.status, statusText: response.statusText, headers });
        for (const key of ['url', 'redirected', 'type']) {
          try { Object.defineProperty(changed, key, { value: response[key] }); } catch {}
        }
        reportChange('apiResponsesChanged');
        return changed;
      } catch { return response; }
    };
  }

  const proto = window.XMLHttpRequest?.prototype;
  if (!proto) return;
  const originalOpen = proto.open;
  const textGetter = Object.getOwnPropertyDescriptor(proto, 'responseText')?.get;
  const responseGetter = Object.getOwnPropertyDescriptor(proto, 'response')?.get;
  if (!textGetter || !responseGetter) return;
  const ownedResponses = new WeakSet();
  proto.open = function (method, url, ...rest) {
    // An XHR object can be reused for an unrelated request; restore its native getters first.
    if (ownedResponses.has(this)) {
      try { delete this.response; delete this.responseText; } catch {}
      ownedResponses.delete(this);
    }
    const active = String(method).toUpperCase() === 'GET' && isPlayInfoUrl(url);
    const result = Reflect.apply(originalOpen, this, [method, url, ...rest]);
    if (!active) return result;
    const xhr = this;
    let previousRaw;
    let cached;
    function readPatch() {
      if (xhr.readyState !== 4 || xhr.status < 200 || xhr.status >= 300) return null;
      const type = xhr.responseType;
      if (type && type !== 'text' && type !== 'json') return null;
      const original = type === 'json' ? responseGetter.call(xhr) : textGetter.call(xhr);
      if (original !== previousRaw) {
        previousRaw = original;
        cached = patchText(type === 'json' ? JSON.stringify(original) : original);
        if (cached) reportChange('apiResponsesChanged');
      }
      return cached;
    }
    try {
      Object.defineProperty(xhr, 'responseText', { configurable: true, get() {
        if (xhr.responseType && xhr.responseType !== 'text') return textGetter.call(xhr);
        return readPatch()?.text ?? textGetter.call(xhr);
      } });
      Object.defineProperty(xhr, 'response', { configurable: true, get() {
        const patch = readPatch();
        return patch ? (xhr.responseType === 'json' ? patch.json : patch.text) : responseGetter.call(xhr);
      } });
      ownedResponses.add(xhr);
    } catch {
      try { delete xhr.response; delete xhr.responseText; } catch {}
    }
    return result;
  };
})();
