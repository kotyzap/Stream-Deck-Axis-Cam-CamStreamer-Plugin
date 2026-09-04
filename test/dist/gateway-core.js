import streamDeck from './sd-stub.js';
import * as http from 'node:http';
import * as https from 'node:https';
import { createHash, randomBytes } from 'node:crypto';
export function connFrom(s) {
    return { cameraIp: s.cameraIp, cameraPort: s.cameraPort, cameraUser: s.cameraUser, cameraPass: s.cameraPass, cameraTls: s.cameraTls };
}
export async function resolveConn(conn) {
    // Merge per-action settings OVER global field-by-field, so a button that sets an
    // IP but no password inherits the global credentials instead of sending a blank one.
    const g = await streamDeck.settings.getGlobalSettings();
    return {
        cameraIp: conn?.cameraIp || g.cameraIp,
        cameraPort: conn?.cameraPort || g.cameraPort,
        cameraUser: conn?.cameraUser || g.cameraUser,
        cameraPass: conn?.cameraPass || g.cameraPass,
        cameraTls: conn?.cameraTls ?? g.cameraTls,
    };
}
/** True when the IP is empty or points at the local machine (can't reach the camera). */
export function isLoopbackOrEmpty(ip) {
    const s = (ip ?? '').trim().toLowerCase();
    return !s || s === 'localhost' || s === '::1' || s.startsWith('127.');
}
// ---- HTTP with digest/basic auth -------------------------------------------
const TIMEOUT_MS = 6000;
const md5 = (s) => createHash('md5').update(s).digest('hex');
function rawRequest(opts, tls, body) {
    return new Promise((resolve, reject) => {
        const lib = tls ? https : http;
        // Explicit Content-Length: without it Node uses chunked transfer-encoding, which
        // the Axis embedded CGI server rejects for POST bodies (the request hangs). See
        // src/gateway.ts for the full explanation.
        const headers = {};
        if (opts.headers)
            Object.assign(headers, opts.headers);
        if (body !== undefined)
            headers['Content-Length'] = Buffer.byteLength(body);
        const req = lib.request({ ...opts, headers, rejectUnauthorized: false }, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: d }));
        });
        req.on('error', reject);
        req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('timeout')));
        if (body !== undefined)
            req.write(body);
        req.end();
    });
}
function buildDigest(challenge, method, uri, user, pass) {
    const get = (k) => {
        const m = challenge.match(new RegExp(`${k}="?([^",]+)"?`, 'i'));
        return m ? m[1] : '';
    };
    const realm = get('realm'), nonce = get('nonce'), qop = get('qop'), opaque = get('opaque');
    const algorithm = get('algorithm') || 'MD5';
    const ha1 = md5(`${user}:${realm}:${pass}`);
    const ha2 = md5(`${method}:${uri}`);
    const cnonce = randomBytes(8).toString('hex');
    const nc = '00000001';
    const response = qop
        ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)
        : md5(`${ha1}:${nonce}:${ha2}`);
    let h = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (qop)
        h += `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
    if (opaque)
        h += `, opaque="${opaque}"`;
    if (algorithm)
        h += `, algorithm=${algorithm}`;
    return h;
}
async function request(method, conn, path, body, contentType) {
    const ip = conn.cameraIp ?? '';
    const tls = !!conn.cameraTls;
    const port = conn.cameraPort || (tls ? 443 : 80);
    const user = conn.cameraUser ?? 'root';
    const pass = conn.cameraPass ?? '';
    const base = {
        hostname: ip, port, path, method,
        headers: contentType ? { 'Content-Type': contentType } : {},
    };
    try {
        let res = await rawRequest(base, tls, body);
        if (res.status === 401) {
            const wa = String(res.headers['www-authenticate'] ?? '');
            const headers = contentType ? { 'Content-Type': contentType } : {};
            if (/^digest/i.test(wa))
                headers.Authorization = buildDigest(wa, method, path, user, pass);
            else
                headers.Authorization = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
            res = await rawRequest({ ...base, headers }, tls, body);
        }
        return { ok: res.status >= 200 && res.status < 300, status: res.status, text: res.text };
    }
    catch (err) {
        return { ok: false, status: 0, text: err instanceof Error ? err.message : String(err) };
    }
}
const camGet = (conn, path) => request('GET', conn, path);
const camPost = (conn, path, body) => request('POST', conn, path, body, 'application/json');
// ---- helpers ----------------------------------------------------------------
function tryParse(text) { try {
    return JSON.parse(text);
}
catch {
    return undefined;
} }
function toBool(v) {
    if (typeof v === 'boolean')
        return v;
    if (v === 1 || v === '1')
        return true;
    if (v === 0 || v === '0')
        return false;
    return null;
}
function fail(error) { return { available: false, items: [], error }; }
// CamStreamer's HTTP API answers a removed/unknown CGI command with the body
// "Http API: command not found" — and often with HTTP 200, not a 4xx. So a plain
// status check isn't enough to tell a present endpoint from an absent one. Treat a
// response as genuinely OK only when the status is 2xx AND the body doesn't carry
// that marker. Lets us probe new-vs-legacy paths and fall back reliably either way.
function camStreamerOk(res) {
    return res.ok && !/command not found/i.test(res.text);
}
// Probe a list of candidate CGI paths in order and return the first response that
// camStreamerOk() accepts; if none work, return the last response so the caller can
// report the real status/body. This is the "support both versions" primitive: a CGI
// that was renamed between CamStreamer-suite app versions is listed new-path-first,
// legacy-path-second, and one package then works on old and new installs alike.
async function camGetFirst(conn, paths) {
    let last = { ok: false, status: 0, text: 'no endpoint tried' };
    for (const path of paths) {
        last = await camGet(conn, path);
        if (camStreamerOk(last))
            return last;
    }
    return last;
}
// ---- discovery (direct VAPIX + product CGIs) --------------------------------
async function discoverPresets(conn) {
    const res = await camGet(conn, '/axis-cgi/com/ptz.cgi?query=presetposall');
    if (!res.ok)
        return fail(`ptz.cgi returned ${res.status}`);
    const items = [];
    let channel = null;
    for (const raw of res.text.split(/\r?\n/)) {
        const line = raw.trim();
        const h = line.match(/^Preset Positions for camera\s+(\d+)/i);
        if (h) {
            channel = parseInt(h[1], 10);
            continue;
        }
        const m = line.match(/^presetposno(\d+)=(.*)$/);
        if (m)
            items.push({ channel, no: parseInt(m[1], 10), name: m[2].trim() });
    }
    return { available: true, items };
}
// AXIS Guarded Tours live in the parameter system (not ptz.cgi). Each tour is a
// group root.GuardTour.G# with Name, CamNbr (the PTZ channel — matches the preset
// "Preset Positions for camera N" numbering), Running (yes/no) and Active (yes/no).
async function discoverGuardTours(conn) {
    const res = await camGet(conn, '/axis-cgi/param.cgi?action=list&group=GuardTour');
    if (!res.ok)
        return fail(`param.cgi returned ${res.status}`);
    const tours = new Map();
    for (const raw of res.text.split(/\r?\n/)) {
        const m = raw.trim().match(/^root\.GuardTour\.(G\d+)\.(\w+)=(.*)$/);
        if (!m)
            continue;
        const [, id, key, val] = m;
        let t = tours.get(id);
        if (!t) {
            t = { channel: null, id, name: '', running: false, active: false };
            tours.set(id, t);
        }
        if (/^Name$/i.test(key))
            t.name = val.trim();
        else if (/^CamNbr$/i.test(key)) {
            const n = parseInt(val, 10);
            t.channel = Number.isFinite(n) ? n : null;
        }
        else if (/^Running$/i.test(key))
            t.running = /^yes$/i.test(val.trim());
        else if (/^Active$/i.test(key))
            t.active = /^yes$/i.test(val.trim());
    }
    // Skip unused/empty tour slots Axis pre-creates (no name and not active).
    const items = [...tours.values()]
        .filter((t) => t.active || t.name.length > 0)
        .map((t) => ({ channel: t.channel, id: t.id, name: t.name || t.id, running: t.running }));
    return { available: true, items };
}
async function discoverOverlays(conn) {
    const res = await camGet(conn, '/local/camoverlay/api/services.cgi?action=get');
    if (!res.ok)
        return fail(`services.cgi returned ${res.status}`);
    const data = tryParse(res.text);
    const list = Array.isArray(data?.services) ? data.services : Array.isArray(data) ? data : [];
    if (!list.length && !Array.isArray(data?.services) && !Array.isArray(data))
        return fail('CamOverlay not available');
    return {
        available: true,
        items: list
            .map((s) => ({ service_id: Number(s.id ?? s.service_id ?? s.serviceID), name: String(s.customName || s.name || s.title || `Service ${s.id ?? '?'}`), enabled: toBool(s.enabled) }))
            .filter((s) => Number.isFinite(s.service_id)),
    };
}
async function discoverStreams(conn) {
    const tryEp = async (path) => {
        const res = await camGet(conn, path);
        if (!camStreamerOk(res))
            return null; // skips 4xx AND 200 "command not found"
        const data = tryParse(res.text);
        if (!data || typeof data !== 'object')
            return null;
        const arr = Array.isArray(data.streamList) ? data.streamList
            : Array.isArray(data?.data?.streamList) ? data.data.streamList
                : Array.isArray(data) ? data : null;
        if (arr) {
            return arr.map((s) => ({ stream_id: String(s.streamId ?? s.stream_id ?? s.id ?? ''), name: String(s.title || s.name || `Stream ${s.streamId ?? '?'}`), enabled: toBool(s.enabled) }))
                .filter((s) => s.stream_id.length > 0);
        }
        const dict = data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : data;
        const entries = Object.entries(dict).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && ('title' in v || 'enabled' in v || 'name' in v || 'mediaServerUrl' in v));
        return entries.length ? entries.map(([id, v]) => ({ stream_id: String(v.streamId ?? v.stream_id ?? id), name: String(v.title || v.name || `Stream ${id}`), enabled: toBool(v.enabled) })) : null;
    };
    const items = (await tryEp('/local/camstreamer/stream_list.cgi?action=get')) ?? (await tryEp('/local/camstreamer/stream/list.cgi?action=get'));
    return items ? { available: true, items } : fail('CamStreamer not available');
}
async function discoverViews(conn) {
    const res = await camGet(conn, '/local/camswitcher/playlists.cgi?action=get');
    if (!res.ok)
        return fail(`playlists.cgi returned ${res.status}`);
    const data = tryParse(res.text);
    const dict = data?.data;
    if (!dict || typeof dict !== 'object')
        return fail('CamSwitcher not available');
    return {
        available: true,
        items: Object.entries(dict).map(([uuid, v]) => ({ name: uuid, label: String(v?.niceName || v?.name || uuid) })).filter((v) => v.name.length > 0),
    };
}
// ---- public API (same names the actions already use) -----------------------
export async function discover(conn) {
    const c = await resolveConn(conn);
    if (!c.cameraIp)
        throw new Error('Camera IP not set (open the action settings)');
    const [ptz_presets, guard_tours, overlay_services, streams, views] = await Promise.all([
        discoverPresets(c), discoverGuardTours(c), discoverOverlays(c), discoverStreams(c), discoverViews(c),
    ]);
    return { ok: true, catalog: { ptz_presets, guard_tours, overlay_services, streams, views } };
}
/** Live running state of every guard tour, keyed by group id (e.g. "G0" -> true). */
export async function fetchGuardTourState(conn) {
    const c = await resolveConn(conn);
    const sec = await discoverGuardTours(c);
    const out = {};
    for (const t of sec.items)
        out[t.id] = t.running;
    return out;
}
/**
 * Stop any guard tour currently running on the given PTZ channel. When `camera`
 * is empty (single view-area device), stop every running tour. Used to keep
 * "one PTZ action at a time": a preset/Home press or a different tour wins.
 */
async function stopToursOnChannel(conn, camera) {
    const sec = await discoverGuardTours(conn);
    if (!sec.available)
        return;
    const ch = camera != null && camera !== '' ? parseInt(camera, 10) : null;
    for (const t of sec.items) {
        if (!t.running)
            continue;
        if (ch != null && t.channel != null && t.channel !== ch)
            continue;
        await camGet(conn, `/axis-cgi/param.cgi?action=update&GuardTour.${t.id}.Running=no`);
    }
}
export async function fetchState(conn) {
    const c = await resolveConn(conn);
    const [streams, overlays] = await Promise.all([discoverStreams(c), discoverOverlays(c)]);
    const streamState = {};
    for (const s of streams.items)
        streamState[String(s.stream_id)] = s.enabled;
    const overlayState = {};
    for (const o of overlays.items)
        overlayState[String(o.service_id)] = o.enabled;
    return { ok: true, streams: streamState, overlays: overlayState, active_view: null };
}
const PTZ = '/axis-cgi/com/ptz.cgi';
const bool = (v) => (v === '1' || v === 'true' || v === 'on' ? '1' : '0');
const withCam = (q, cam) => (cam ? `${q}&camera=${encodeURIComponent(cam)}` : q);
// One-push autofocus via the AXIS Optics Control API (JSON over opticscontrol.cgi).
// This is the correct path for fixed/box cameras. The CGI returns HTTP 200 even on
// a logical error, so we inspect the body for an `error` object. JSON shape per Axis:
//   { apiVersion, method: "performAutoFocus", params: { optics: [ { opticsId } ] } }
async function opticsAutoFocus(conn, opticsId) {
    const post = (payload) => camPost(conn, '/axis-cgi/opticscontrol.cgi', JSON.stringify(payload));
    let ids = opticsId ? [opticsId] : [];
    if (!ids.length) {
        const g = await post({ apiVersion: '1.0', context: 'sd', method: 'getOptics' });
        if (g.status === 401 || g.status === 0)
            return g;
        const optics = tryParse(g.text)?.data?.optics;
        if (Array.isArray(optics))
            ids = optics.map((o) => String(o.opticsId)).filter((s) => s.length > 0);
    }
    if (!ids.length)
        ids = ['0'];
    const res = await post({
        apiVersion: '1.0',
        context: 'sd',
        method: 'performAutofocus',
        params: { optics: ids.map((id) => ({ opticsId: id })) },
    });
    const j = tryParse(res.text);
    if (j?.error)
        return { ok: false, status: res.status, text: `opticscontrol ${j.error.code}: ${j.error.message}` };
    return res;
}
export async function sendCmd(params, conn) {
    const c = await resolveConn(conn);
    if (!c.cameraIp)
        return { ok: false, error: 'Camera IP not set' };
    const a = params.action;
    let res;
    switch (a) {
        case 'ptz.preset':
            // A running guard tour would fight the move (and keep resuming), so stop
            // any tour on this channel first — only one PTZ action runs at a time.
            await stopToursOnChannel(c, params.camera);
            if (params.name)
                res = await camGet(c, withCam(`${PTZ}?gotoserverpresetname=${encodeURIComponent(params.name)}`, params.camera));
            else if (params.no)
                res = await camGet(c, withCam(`${PTZ}?gotoserverpresetno=${encodeURIComponent(params.no)}`, params.camera));
            else
                return { ok: false, error: 'preset requires name or no' };
            break;
        case 'ptz.home':
            await stopToursOnChannel(c, params.camera);
            res = await camGet(c, withCam(`${PTZ}?move=home`, params.camera));
            break;
        case 'guardtour.start':
            if (!params.guardtour_id)
                return { ok: false, error: 'guardtour.start requires guardtour_id' };
            // One tour per channel: stop others on this channel before starting ours.
            await stopToursOnChannel(c, params.camera);
            res = await camGet(c, `/axis-cgi/param.cgi?action=update&GuardTour.${encodeURIComponent(params.guardtour_id)}.Running=yes`);
            break;
        case 'guardtour.stop':
            if (!params.guardtour_id)
                return { ok: false, error: 'guardtour.stop requires guardtour_id' };
            res = await camGet(c, `/axis-cgi/param.cgi?action=update&GuardTour.${encodeURIComponent(params.guardtour_id)}.Running=no`);
            break;
        case 'stream.set': {
            // CamStreamer 5/6 renamed `set_stream_enabled.cgi` → `stream/set.cgi`.
            // Probe new-first, legacy-second so one package drives both.
            const q = `stream_id=${encodeURIComponent(params.stream_id)}&enabled=${bool(params.enabled)}`;
            res = await camGetFirst(c, [
                `/local/camstreamer/stream/set.cgi?${q}`, // CamStreamer 5/6
                `/local/camstreamer/set_stream_enabled.cgi?${q}`, // CamStreamer ≤4 (legacy)
            ]);
            break;
        }
        case 'overlay.toggle':
            return overlayToggle(c, Number(params.service_id), bool(params.enabled) === '1');
        case 'view.switch':
            res = await camGet(c, `/local/camswitcher/playlist_switch.cgi?playlist_name=${encodeURIComponent(params.name)}`);
            break;
        // ---- Cam Control (optics) ------------------------------------------
        // These VAPIX paths vary a little by model/firmware; they're grouped here
        // so they're easy to adjust for a specific camera if needed.
        case 'cam.autofocus': {
            // Fixed/box cameras (e.g. AXIS Q1656) trigger autofocus via the Optics
            // Control API. PTZ cameras don't support opticscontrol.cgi, so fall back
            // to the legacy optics-setup CGI and then PTZ continuous autofocus.
            res = await opticsAutoFocus(c, params.optics_id);
            // Don't cascade legacy fallbacks on auth (401) / connection (0) failure —
            // extra failed logins trip the camera's Authentication-DoS firewall.
            if (!res.ok && res.status !== 401 && res.status !== 0) {
                let fb = await camGet(c, '/axis-cgi/opticssetup.cgi?autofocus=perform');
                if (!fb.ok)
                    fb = await camGet(c, withCam(`${PTZ}?autofocus=on`, params.camera));
                if (fb.ok)
                    res = fb;
            }
            break;
        }
        case 'cam.defog':
            res = await camGet(c, `/axis-cgi/param.cgi?action=update&ImageSource.I0.Sensor.Defog=${bool(params.enabled) === '1' ? 'on' : 'off'}`);
            break;
        case 'cam.defog.toggle': {
            const cur = await readDefog(c);
            const want = cur === true ? 'off' : 'on';
            res = await camGet(c, `/axis-cgi/param.cgi?action=update&ImageSource.I0.Sensor.Defog=${want}`);
            break;
        }
        case 'cam.wiper': {
            // Wiper is a PTZ auxiliary command. The value is CASE-SENSITIVE: the
            // ONVIF-standard token is "tt:Wiper|On"/"tt:Wiper|Off" (capital W). `state=off`
            // sends the explicit Off; otherwise on (positioning cams use "speeddry").
            const aux = (v) => withCam(`${PTZ}?auxiliary=${encodeURIComponent(v)}`, params.camera);
            if (params.state === 'off') {
                res = await camGet(c, aux('tt:Wiper|Off'));
            }
            else {
                res = await camGet(c, aux('tt:Wiper|On'));
                if (!res.ok)
                    res = await camGet(c, aux('speeddry'));
            }
            break;
        }
        case 'cam.ircut': {
            const m = params.mode === 'off' ? 'off' : params.mode === 'auto' ? 'auto' : 'on';
            // PTZ cameras: ptz.cgi?ircutfilter=. Fixed/box cameras: the IrCutFilter
            // parameter (yes = filter in/day, no = filter out/night, auto).
            res = await camGet(c, withCam(`${PTZ}?ircutfilter=${m}`, params.camera));
            if (!res.ok) {
                const v = m === 'on' ? 'yes' : m === 'off' ? 'no' : 'auto';
                res = await camGet(c, `/axis-cgi/param.cgi?action=update&ImageSource.I0.DayNight.IrCutFilter=${v}`);
            }
            break;
        }
        default:
            return { ok: false, error: `unknown action ${a}` };
    }
    // Body-aware verdict for every command: a CamStreamer-suite CGI that was renamed
    // away can answer HTTP 200 with "command not found", which res.ok alone would
    // misread as success. camStreamerOk() catches that and gives a clearer error.
    if (camStreamerOk(res))
        return { ok: true };
    const error = /command not found/i.test(res.text)
        ? 'endpoint not found — check the installed CamStreamer/CamOverlay/CamSwitcher app version'
        : res.status ? `camera returned ${res.status}` : res.text || 'request failed';
    return { ok: false, error };
}
// CamOverlay show/hide: persistent full-list write-back.
async function overlayToggle(conn, id, want) {
    const list = await camGet(conn, '/local/camoverlay/api/services.cgi?action=get');
    if (!camStreamerOk(list))
        return { ok: false, error: `services.cgi get ${list.status || list.text}` };
    const data = tryParse(list.text);
    const services = Array.isArray(data?.services) ? data.services : Array.isArray(data) ? data : [];
    let found = false;
    for (const s of services)
        if (Number(s.id ?? s.service_id ?? s.serviceID) === id) {
            s.enabled = want ? 1 : 0;
            found = true;
        }
    if (!found)
        return { ok: false, error: `service ${id} not found` };
    const post = await camPost(conn, '/local/camoverlay/api/services.cgi?action=set', JSON.stringify({ services }));
    return camStreamerOk(post) ? { ok: true } : { ok: false, error: `services.cgi set ${post.status || post.text}` };
}
export async function readDefog(conn) {
    const c = await resolveConn(conn);
    if (!c.cameraIp)
        return null;
    const res = await camGet(c, '/axis-cgi/param.cgi?action=list&group=ImageSource.I0.Sensor.Defog');
    if (!res.ok)
        return null;
    const m = res.text.match(/Defog\s*=\s*(\w+)/i);
    if (!m)
        return null;
    return /^(on|yes|true|1)$/i.test(m[1]);
}
export function parseSel(sel) {
    if (!sel)
        return null;
    try {
        return JSON.parse(sel);
    }
    catch {
        return null;
    }
}
