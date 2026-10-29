const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../bilibili-live-route-repair.user.js'), 'utf8');
const API = 'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=6&protocol=0&format=0&codec=1&qn=80';
const makeCodec = (name, host, file) => ({ codec_name: name, current_qn: 150, base_url: '/live-bvc/' + file, url_info: [{ host: 'https://' + host, extra: '?expires=123&signature=fixture' }] });
const fixture = () => ({ code: 0, data: { room_id: 7734200, playurl_info: { playurl: { stream: [
  { protocol_name: 'http_stream', format: [{ format_name: 'flv', codec: [makeCodec('avc', 'd1--ov-gotcha05.bilivideo.com', 'stream.flv'), makeCodec('hevc', 'd1--ov-gotcha05b.bilivideo.com', 'hevc.flv')] }] },
  { protocol_name: 'http_hls', format: [
    { format_name: 'ts', codec: [makeCodec('avc', 'd1--ov-gotcha105.bilivideo.com', 'stream.m3u8'), makeCodec('hevc', 'd1--ov-gotcha105.bilivideo.com', 'hevc.m3u8')] },
    { format_name: 'fmp4', codec: [makeCodec('avc', 'd1--ov-gotcha207.bilivideo.com', 'stream.m3u8'), makeCodec('hevc', 'd1--ov-gotcha207b.bilivideo.com', 'hevc.m3u8')] }
  ] }
] } } } });

function setup(options = {}) {
  const calls = [];
  const listeners = new Map();
  const doc = { body: null, baseURI: 'https://live.bilibili.com/6', addEventListener(name, listener) { listeners.set(name, listener); } };
  class FakeXHR {
    constructor() { this.readyState = 0; this.status = 0; this.responseType = ''; }
    open(method, url, ...rest) { this.method = method; this.openUrl = String(url); this.openRest = rest; this.readyState = 1; }
    complete(payload, status = 200) { this.raw = payload; this.status = status; this.readyState = 4; }
    get responseText() { if (this.responseType && this.responseType !== 'text') throw new Error('InvalidStateError'); return typeof this.raw === 'string' ? this.raw : JSON.stringify(this.raw); }
    get response() { return this.responseType === 'json' ? this.raw : this.responseText; }
  }
  const location = { hostname: options.host || 'live.bilibili.com', href: 'https://' + (options.host || 'live.bilibili.com') + '/6', origin: 'https://' + (options.host || 'live.bilibili.com') };
  if (options.blankChild) Object.assign(location, { hostname: '', href: 'about:blank', origin: 'null' });
  const originalResponse = options.response || new Response(JSON.stringify(options.payload || fixture()), { status: options.status || 200, headers: { 'content-type': 'application/json', 'content-length': '999', etag: 'old' } });
  Object.defineProperty(originalResponse, 'url', { value: API });
  const win = {
    location, document: doc, XMLHttpRequest: FakeXHR,
    addEventListener() {},
    fetch: async function (input, init) { calls.push({ input, init }); if (options.reject) throw options.reject; return options.responseProvider ? options.responseProvider(calls.length) : originalResponse; }
  };
  win.top = win;
  win.parent = options.blankChild ? { location: { hostname: options.parentHost || 'live.bilibili.com' } } : win;
  const originalFetch = win.fetch;
  const sandbox = { window: win, location, document: doc, Request, Response, Headers, URL, WeakSet, Object, JSON, Reflect, setTimeout, clearTimeout };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  return { win, calls, originalResponse, originalFetch, FakeXHR };
}

function assertNativeFlv(body) {
  const normalized = JSON.parse(JSON.stringify(body));
  const streams = normalized.data.playurl_info.playurl.stream;
  assert.equal(streams.length, 1);
  assert.equal(streams[0].protocol_name, 'http_stream');
  assert.equal(streams[0].format.length, 1);
  assert.equal(streams[0].format[0].format_name, 'flv');
  const expected = fixture();
  expected.data.playurl_info.playurl.stream = [expected.data.playurl_info.playurl.stream[0]];
  assert.deepEqual(normalized, expected);
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }
test('fetch selects official FLV while preserving its codecs, quality and signed server URLs', async () => {
  const { win, calls } = setup();
  const response = await win.fetch(API);
  const body = await response.json();
  assertNativeFlv(body);
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
test('missing, unsafe, HEVC-only and already-selected FLV responses remain unchanged', async () => {
  for (const routeCase of ['missing-flv', 'untrusted', 'hevc-only', 'already-flv', 'wrong-path']) {
    const payload = fixture();
    const flv = payload.data.playurl_info.playurl.stream[0].format[0];
    if (routeCase === 'missing-flv') payload.data.playurl_info.playurl.stream.shift();
    if (routeCase === 'untrusted') flv.codec[0].url_info[0].host = 'https://third-party.invalid';
    if (routeCase === 'hevc-only') flv.codec.shift();
    if (routeCase === 'already-flv') payload.data.playurl_info.playurl.stream.pop();
    if (routeCase === 'wrong-path') flv.codec[0].base_url = '/not-a-live-path';
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
test('XHR text and JSON select FLV once; API queries and unrelated reuse remain unchanged', () => {
  for (const type of ['', 'text', 'json']) {
    const { FakeXHR, win } = setup();
    const xhr = new FakeXHR();
    xhr.responseType = type;
    xhr.open('GET', API, true);
    assert.equal(xhr.openUrl, API);
    xhr.complete(type === 'json' ? fixture() : JSON.stringify(fixture()));
    assertNativeFlv(type === 'json' ? xhr.response : JSON.parse(xhr.responseText));
    assertNativeFlv(type === 'json' ? xhr.response : JSON.parse(xhr.response));
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
  assertNativeFlv(state.roomPlayInfoRes);
  assert.equal(state.roomInfoRes.title, 'test title');
  assert.equal(win.__biliLiveRouteRepairV1.status().embeddedResponsesChanged, 1);
});
test('other websites are not hooked', () => {
  const { win, originalFetch } = setup({ host: 'www.bilibili.com' });
  assert.equal(win.fetch, originalFetch);
  assert.equal(win.__biliLiveRouteRepairV1, undefined);
});
test('each play-info request uses its own fresh official host and signature', async () => {
  const { win } = setup({ responseProvider: count => {
    const payload = fixture();
    const codec = payload.data.playurl_info.playurl.stream[0].format[0].codec[0];
    codec.url_info[0] = { host: `https://d${count}--ov-gotcha05.bilivideo.com`, extra: `?signature=fresh-${count}` };
    return new Response(JSON.stringify(payload));
  } });
  for (let count = 1; count <= 2; count++) {
    const result = await (await win.fetch(API)).json();
    const urlInfo = result.data.playurl_info.playurl.stream[0].format[0].codec[0].url_info[0];
    assert.equal(urlInfo.host, `https://d${count}--ov-gotcha05.bilivideo.com`);
    assert.equal(urlInfo.extra, `?signature=fresh-${count}`);
  }
});
test('iframe play information is handled without requiring a top-frame document', async () => {
  const { win } = setup();
  const sent = [];
  win.top = { postMessage(message, origin) { sent.push({ message, origin }); } };
  const result = await (await win.fetch(API)).json();
  assertNativeFlv(result);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].origin, 'https://live.bilibili.com');
  assert.equal(sent[0].message.changed, true);
});
test('a blank iframe inherited from the live page is hooked before document.write', async () => {
  const { win } = setup({ blankChild: true });
  const result = await (await win.fetch('//api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=6')).json();
  assertNativeFlv(result);
});
test('blank iframes from unrelated parent sites are not hooked', () => {
  const { win, originalFetch } = setup({ blankChild: true, parentHost: 'example.invalid' });
  assert.equal(win.fetch, originalFetch);
  assert.equal(win.__biliLiveRouteRepairV1, undefined);
});

(async () => {
  for (const [name, run] of tests) { await run(); console.log('PASS ' + name); }
  console.log(`${tests.length}/${tests.length} tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
