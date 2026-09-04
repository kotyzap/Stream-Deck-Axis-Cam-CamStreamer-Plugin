// Minimal fake Axis camera: VAPIX + CamStreamer/CamOverlay/CamSwitcher.
// Forces HTTP digest auth (401 challenge) to exercise the gateway's auth path.
import http from 'node:http';

const USER = 'root', PASS = 'pass';

// mutable device state so toggles are observable
const state = {
  tours: { G0: { Name: 'Lobby Tour', CamNbr: 1, Running: 'no', Active: 'yes' },
           G1: { Name: '', CamNbr: 1, Running: 'no', Active: 'no' } }, // empty slot -> filtered out
  overlays: [ { id: 1, name: 'Logo', enabled: 0 }, { id: 2, name: 'Clock', enabled: 1 } ],
  streams: { '0': { title: 'YouTube Live', enabled: 0 }, '1': { title: 'Backup RTMP', enabled: 1 } },
  views: { 'uuid-a': { niceName: 'Wide View' }, 'uuid-b': { niceName: 'Zoom View' } },
  wiper: 0, afPerformed: 0, defog: null, ircut: null,
  log: [],
};

const send = (res, code, body, headers = {}) => { res.writeHead(code, headers); res.end(body); };

export function startMock(port = 0) {
  const server = http.createServer((req, res) => {
    // require digest auth: challenge when missing
    if (!req.headers.authorization) {
      return send(res, 401, 'Unauthorized', {
        'WWW-Authenticate': 'Digest realm="AXIS_MOCK", nonce="' + Date.now().toString(16) + '", qop="auth"',
      });
    }
    const u = new URL(req.url, 'http://x');
    const p = u.pathname, q = u.searchParams;
    state.log.push(req.method + ' ' + req.url);

    // Mirror the Axis embedded CGI: a POST body MUST arrive with a Content-Length.
    // Node sends chunked (no Content-Length) unless the client sets it explicitly, and
    // the real camera hangs/rejects those. Reject here so the suite catches the bug.
    if (req.method === 'POST' && !req.headers['content-length']) {
      return send(res, 411, 'Length Required');
    }

    // ---- VAPIX PTZ ----
    if (p === '/axis-cgi/com/ptz.cgi') {
      if (q.get('query') === 'presetposall')
        return send(res, 200, 'Preset Positions for camera 1\npresetposno1=Home\npresetposno2=Gate\npresetposno3=Parking\n');
      if (q.has('gotoserverpresetname') || q.has('gotoserverpresetno') || q.get('move') === 'home')
        return send(res, 200, 'OK');
      if (q.get('autofocus') === 'on') return send(res, 200, 'OK');
      // Real cameras only accept the case-sensitive ONVIF token / speeddry, not "wiper".
      if (q.get('auxiliary') === 'tt:Wiper|On' || q.get('auxiliary') === 'speeddry') { state.wiper = (state.wiper||0)+1; return send(res, 200, 'OK'); }
      if (q.get('auxiliary') === 'tt:Wiper|Off') { state.wiperOff = (state.wiperOff||0)+1; return send(res, 200, 'OK'); }
      if (['on','off','auto'].includes(q.get('ircutfilter'))) { state.ircut = q.get('ircutfilter'); return send(res, 200, 'OK'); }
      return send(res, 400, 'bad ptz');
    }
    // ---- VAPIX param.cgi (GuardTour) ----
    if (p === '/axis-cgi/param.cgi') {
      if (q.get('action') === 'list' && q.get('group') === 'GuardTour') {
        let out = '';
        for (const [id, t] of Object.entries(state.tours))
          out += `root.GuardTour.${id}.Name=${t.Name}\nroot.GuardTour.${id}.CamNbr=${t.CamNbr}\nroot.GuardTour.${id}.Running=${t.Running}\nroot.GuardTour.${id}.Active=${t.Active}\n`;
        return send(res, 200, out);
      }
      if (q.get('action') === 'list' && q.get('group') === 'ImageSource.I0.Sensor.Defog') {
        return send(res, 200, `root.ImageSource.I0.Sensor.Defog=${state.defog ?? 'off'}\n`);
      }
      if (q.get('action') === 'update') {
        for (const [k, v] of q) {
          const m = k.match(/^GuardTour\.(G\d+)\.Running$/); if (m && state.tours[m[1]]) state.tours[m[1]].Running = v;
          if (k === 'ImageSource.I0.Sensor.Defog') state.defog = v;
        }
        return send(res, 200, 'OK');
      }
      return send(res, 400, 'bad param');
    }
    // ---- Optics Control API (autofocus on fixed/box cameras like Q1656) ----
    if (p === '/axis-cgi/opticscontrol.cgi') {
      let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
        let j=null; try{j=JSON.parse(body);}catch{}
        const m=j&&j.method;
        // Simulate an AXIS Q1656 whose optics id is "1" (NOT "0"): the client must
        // discover it via getOptics and pass it back. Method names are case-sensitive.
        if (m==='getOptics') return send(res,200,JSON.stringify({apiVersion:'1.1',data:{optics:[{opticsId:'1',focusPosition:50}]}}));
        if (m==='performAutofocus'){
          const ids=((j&&j.params&&j.params.optics)||[]).map(o=>String(o.opticsId));
          if (ids.includes('1')){ state.afPerformed=(state.afPerformed||0)+1; return send(res,200,JSON.stringify({apiVersion:'1.1',method:m,data:{}})); }
          return send(res,200,JSON.stringify({apiVersion:'1.1',method:m,error:{code:1100,message:'no such optics'}}));
        }
        return send(res,200,JSON.stringify({apiVersion:'1.1',method:m,error:{code:2103,message:'unknown method'}}));
      }); return;
    }
    // ---- Optics setup (legacy one-push autofocus) ----
    // Simulate FW12: the legacy opticssetup.cgi is gone, so autofocus MUST succeed via
    // the Optics Control API above (correct method + discovered opticsId).
    if (p === '/axis-cgi/opticssetup.cgi') return send(res, 404, 'not found');
    // ---- CamOverlay ----
    if (p === '/local/camoverlay/api/services.cgi') {
      if (q.get('action') === 'get') return send(res, 200, JSON.stringify({ services: state.overlays }));
      if (q.get('action') === 'set') {
        let body = ''; req.on('data', c => body += c); req.on('end', () => {
          try { const d = JSON.parse(body); if (Array.isArray(d.services)) state.overlays = d.services; } catch {}
          send(res, 200, JSON.stringify({ status: 'ok' }));
        }); return;
      }
    }
    // ---- CamStreamer ----
    if (p === '/local/camstreamer/stream_list.cgi' && q.get('action') === 'get')
      return send(res, 200, JSON.stringify({ data: state.streams }));
    // Simulate an OLDER CamStreamer (legacy path only). The modern stream/set.cgi
    // is absent, and — like real CamStreamer — it answers with HTTP 200 + a
    // "command not found" body rather than a 4xx. This exercises both the legacy
    // fallback and the body-aware camStreamerOk() check.
    if (p === '/local/camstreamer/stream/set.cgi')
      return send(res, 200, 'Http API: command not found');
    if (p === '/local/camstreamer/set_stream_enabled.cgi') {
      const id = q.get('stream_id'); if (state.streams[id]) state.streams[id].enabled = q.get('enabled') === '1' ? 1 : 0;
      return send(res, 200, JSON.stringify({ status: 'ok' }));
    }
    // ---- CamSwitcher ----
    if (p === '/local/camswitcher/playlists.cgi' && q.get('action') === 'get')
      return send(res, 200, JSON.stringify({ data: state.views }));
    if (p === '/local/camswitcher/playlist_switch.cgi')
      return send(res, 200, JSON.stringify({ status: 'ok' }));

    send(res, 404, 'not found');
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, state })));
}
