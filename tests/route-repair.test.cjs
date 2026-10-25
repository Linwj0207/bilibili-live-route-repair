const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../bilibili-live-route-repair.user.js'), 'utf8');
const API = 'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=6&protocol=0&format=0&codec=1&qn=80';
const makeCodec = (name, host, file) => ({ codec_name: name, current_qn: 150, base_url: '/live-bvc/' + file, url_info: [{ host: 'https://' + host, extra: '?expires=123&signature=fixture' }] });
const fixture = () => ({ code: 0, data: { room_id: 7734200, playurl_info: { playurl: { stream: [
  { protocol_name: 'http_stream', format: [{ format_name: 'flv', codec: [makeCodec('avc', 'd1--ov-gotcha07.bilivideo.com', 'stream.flv')] }] },
  { protocol_name: 'http_hls', format: [
    { format_name: 'ts', codec: [makeCodec('avc', 'd1--ov-gotcha105.bilivideo.com', 'stream.m3u8'), makeCodec('hevc', 'd1--ov-gotcha105.bilivideo.com', 'hevc.m3u8')] },
    { format_name: 'fmp4', codec: [makeCodec('avc', 'd1--ov-gotcha207.bilivideo.com', 'stream.m3u8'), makeCodec('hevc', 'd1--ov-gotcha207b.bilivideo.com', 'hevc.m3u8')] }
  ] }
] } } } });

function setup(options = {}) {
  const calls = [];
  const listeners = new Map();
  const doc = { body: null, addEventListener(name, listener) { listeners.set(name, listener); } };
  class FakeXHR {
    constructor() { this.readyState = 0; this.status = 0; this.responseType = ''; }
    open(method, url, ...rest) { this.method = method; this.openUrl = String(url); this.openRest = rest; this.readyState = 1; }
    complete(payload, status = 200) { this.raw = payload; this.status = status; this.readyState = 4; }
    get responseText() { if (this.responseType && this.responseType !== 'text') throw new Error('InvalidStateError'); return typeof this.raw === 'string' ? this.raw : JSON.stringify(this.raw); }
    get response() { return this.responseType === 'json' ? this.raw : this.responseText; }
  }
  const location = { hostname: options.host || 'live.bilibili.com', href: 'https://' + (options.host || 'live.bilibili.com') + '/6', origin: 'https://' + (options.host || 'live.bilibili.com') };
  const originalResponse = options.response || new Response(JSON.stringify(options.payload || fixture()), { status: options.status || 200, headers: { 'content-type': 'application/json', 'content-length': '999', etag: 'old' } });
  Object.defineProperty(originalResponse, 'url', { value: API });
  const win = {
    location, document: doc, XMLHttpRequest: FakeXHR,
    addEventListener() {},
    fetch: async function (input, init) { calls.push({ input, init }); if (options.reject) throw options.reject; return originalResponse; }
  };
  win.top = win;
  const originalFetch = win.fetch;
  const sandbox = { window: win, location, document: doc, Request, Response, Headers, URL, WeakSet, Object, JSON, Reflect, setTimeout, clearTimeout };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  return { win, calls, originalResponse, originalFetch, FakeXHR };
}

function assertOriginalStreamsAndBackup(body) {
  const normalized = JSON.parse(JSON.stringify(body));
  const streams = normalized.data.playurl_info.playurl.stream;
  assert.equal(streams.length, 2);
  assert.equal(streams[0].format[0].format_name, 'flv');
  assert.equal(streams[1].format[0].format_name, 'ts');
  assert.equal(streams[1].format[1].format_name, 'fmp4');
  for (const codec of streams[1].format[1].codec) {
    assert.equal(codec.url_info.length, 2);
    assert.equal(codec.url_info[0].host, 'https://d1--cn-gotcha204.bilivideo.com');
    assert.equal(codec.url_info[0].extra, codec.url_info[1].extra);
    codec.url_info.shift();
  }
  // After removing only the two added CDN entries, every original field must match.
  assert.deepEqual(normalized, fixture());
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }
test('fetch retains every original format, codec, quality and URL while adding fMP4 backups', async () => {
  const { win, calls } = setup();
  const response = await win.fetch(API);
  const body = await response.json();
  assertOriginalStreamsAndBackup(body);
  assert.equal(body.data.room_id, 7734200);
  assert.equal(calls[0].input, API);
  assert.equal(response.headers.get('content-length'), null);
  assert.equal(response.headers.get('etag'), null);
  assert.equal(response.url, API);
});
test('unrelated requests and non-GET requests pass through unchanged', async () => {
  const { win, calls, originalResponse } = setup();
  assert.equal(await win.fetch('https://api.bilibili.com/x/player/wbi/playurl'), originalResponse);
  assert.equal(await win.fetch(API, { method: 'POST', body: 'example' }), originalResponse);
  assert.equal(calls[0].input, 'https://api.bilibili.com/x/player/wbi/playurl');
  assert.equal(calls[1].input, API);
  assert.equal(calls[1].init.body, 'example');
});
test('Request objects preserve headers, credentials and cancellation', async () => {
  const { win, calls } = setup();
  const abort = new AbortController();
  const request = new Request(API, { headers: { 'x-fixture': 'present' }, credentials: 'include', signal: abort.signal });
  await win.fetch(request);
  assert.equal(calls[0].input, request);
  assert.equal(calls[0].input.headers.get('x-fixture'), 'present');
  assert.equal(calls[0].input.credentials, 'include');
  abort.abort();
  assert.equal(calls[0].input.signal.aborted, true);
});
test('signed and unknown-format API requests keep their exact original query', async () => {
  for (const url of [API + '&w_rid=test&wts=1', API.replace('format=0', 'format=9')]) {
    const { win, calls } = setup();
    await win.fetch(url);
    assert.equal(calls[0].input, url);
  }
});
test('denied, malformed and non-success responses are not rewritten', async () => {
  for (const options of [{ payload: { code: 6003, data: fixture().data } }, { response: new Response('not json') }, { status: 403 }]) {
    const { win, originalResponse } = setup(options);
    assert.equal(await win.fetch(API), originalResponse);
  }
});
test('TS-only, already-working and non-official routes retain the original response', async () => {
  for (const routeCase of ['ts-only', 'untrusted', 'working', 'already-added']) {
    const payload = fixture();
    const hls = payload.data.playurl_info.playurl.stream[1];
    if (routeCase === 'ts-only') hls.format = hls.format.filter(f => f.format_name !== 'fmp4');
    else for (const codec of hls.format[1].codec) {
      codec.url_info[0].host = routeCase === 'untrusted' ? 'https://third-party.invalid' : routeCase === 'working' ? 'https://d1--ov-gotcha208.bilivideo.com' : 'https://d1--cn-gotcha204.bilivideo.com';
    }
    const { win, originalResponse } = setup({ payload });
    assert.equal(await win.fetch(API), originalResponse);
  }
});
test('network rejection propagates without retries or extra requests', async () => {
  const failure = new Error('fixture network failure');
  const { win, calls } = setup({ reject: failure });
  await assert.rejects(win.fetch(API), error => error === failure);
  assert.equal(calls.length, 1);
});
test('XHR text and JSON preserve formats; API queries and unrelated reuse remain unchanged', () => {
  for (const type of ['', 'text', 'json']) {
    const { FakeXHR, win } = setup();
    const xhr = new FakeXHR();
    xhr.responseType = type;
    xhr.open('GET', API, true);
    assert.equal(xhr.openUrl, API);
    xhr.complete(type === 'json' ? fixture() : JSON.stringify(fixture()));
    assertOriginalStreamsAndBackup(type === 'json' ? xhr.response : JSON.parse(xhr.responseText));
    assertOriginalStreamsAndBackup(type === 'json' ? xhr.response : JSON.parse(xhr.response));
    assert.equal(win.__biliLiveRouteRepairV1.status().apiResponsesChanged, 1);
    if (type === 'json') assert.throws(() => xhr.responseText, /InvalidStateError/);
    xhr.open('GET', 'https://example.invalid/unrelated', true);
    xhr.complete(type === 'json' ? { unchanged: true } : 'unchanged');
    assert.equal(xhr.openUrl, 'https://example.invalid/unrelated');
    if (type === 'json') assert.equal(xhr.response.unchanged, true);
    else assert.equal(xhr.response, 'unchanged');
  }
});
test('initial embedded play information is supported without changing unrelated fields', () => {
  const { win } = setup();
  const state = { roomPlayInfoRes: fixture(), roomInfoRes: { title: 'test title' } };
  win.__NEPTUNE_IS_MY_WAIFU__ = state;
  assert.equal(win.__NEPTUNE_IS_MY_WAIFU__, state);
  assertOriginalStreamsAndBackup(state.roomPlayInfoRes);
  assert.equal(state.roomInfoRes.title, 'test title');
  assert.equal(win.__biliLiveRouteRepairV1.status().embeddedResponsesChanged, 1);
});
test('other websites are not hooked', () => {
  const { win, originalFetch } = setup({ host: 'www.bilibili.com' });
  assert.equal(win.fetch, originalFetch);
  assert.equal(win.__biliLiveRouteRepairV1, undefined);
});

(async () => {
  for (const [name, run] of tests) { await run(); console.log('PASS ' + name); }
  console.log(`${tests.length}/${tests.length} tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
