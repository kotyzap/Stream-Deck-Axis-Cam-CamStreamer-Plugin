// Test harness: exercises the REAL gateway.ts logic (compiled to ./dist) against
// either the built-in mock Axis server (default) or a live camera.
//   node run.mjs            -> mock mode
//   CAM_IP=192.168.1.156 CAM_USER=root CAM_PASS=xxx node run.mjs   -> live mode
import { startMock } from './mock-axis.mjs';
import * as gw from './dist/gateway-core.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { (cond?pass++:fail++); console.log(`${cond?'✅':'❌'} ${name}${extra?'  '+extra:''}`); };

async function main() {
  const live = !!process.env.CAM_IP;
  let conn, mock;
  if (live) {
    conn = { cameraIp: process.env.CAM_IP, cameraPort: Number(process.env.CAM_PORT)||80, cameraUser: process.env.CAM_USER||'root', cameraPass: process.env.CAM_PASS||'', cameraTls: process.env.CAM_TLS==='1' };
    console.log(`\n=== LIVE mode → ${conn.cameraIp}:${conn.cameraPort} ===\n`);
  } else {
    mock = await startMock();
    conn = { cameraIp: '127.0.0.1', cameraPort: mock.port, cameraUser: 'root', cameraPass: 'pass', cameraTls: false };
    console.log(`\n=== MOCK mode → 127.0.0.1:${mock.port} ===\n`);
  }

  // ---- discovery ----
  const { catalog } = await gw.discover(conn);
  console.log('Discovery:');
  console.log('  presets :', catalog.ptz_presets.available, catalog.ptz_presets.items.map(p=>p.name).join(', '));
  console.log('  tours   :', catalog.guard_tours.available, catalog.guard_tours.items.map(t=>`${t.id}:${t.name}`).join(', '));
  console.log('  overlays:', catalog.overlay_services.available, catalog.overlay_services.items.map(o=>`${o.service_id}:${o.name}`).join(', '));
  console.log('  streams :', catalog.streams.available, catalog.streams.items.map(s=>`${s.stream_id}:${s.name}`).join(', '));
  console.log('  views   :', catalog.views.available, catalog.views.items.map(v=>v.label).join(', '));
  console.log();

  if (!live) {
    ok('discover: 3 presets', catalog.ptz_presets.items.length===3);
    ok('discover: 1 tour (empty slot filtered)', catalog.guard_tours.items.length===1 && catalog.guard_tours.items[0].id==='G0');
    ok('discover: 2 overlays', catalog.overlay_services.items.length===2);
    ok('discover: 2 streams', catalog.streams.items.length===2);
    ok('discover: 2 views', catalog.views.items.length===2);
  }

  // ---- commands (existing) ----
  const send = (p) => gw.sendCmd(p, conn);
  ok('ptz.preset (Gate)', (await send({action:'ptz.preset', name:'Gate', camera:'1'})).ok);
  ok('ptz.home',          (await send({action:'ptz.home', camera:'1'})).ok);
  ok('guardtour.start G0',(await send({action:'guardtour.start', guardtour_id:'G0', camera:'1'})).ok);
  ok('guardtour.stop G0', (await send({action:'guardtour.stop', guardtour_id:'G0'})).ok);
  ok('stream.set 0 on',   (await send({action:'stream.set', stream_id:'0', enabled:'1'})).ok);
  ok('overlay.toggle 1 on',(await send({action:'overlay.toggle', service_id:'1', enabled:'1'})).ok);
  ok('view.switch uuid-a',(await send({action:'view.switch', name:'uuid-a'})).ok);

  // ---- commands (NEW: Cam Control) ----
  ok('cam.autofocus',     (await send({action:'cam.autofocus'})).ok);
  ok('cam.defog on',      (await send({action:'cam.defog', enabled:'1'})).ok);
  ok('cam.defog off',     (await send({action:'cam.defog', enabled:'0'})).ok);
  ok('cam.defog.toggle',  (await send({action:'cam.defog.toggle'})).ok);
  ok('cam.wiper on',      (await send({action:'cam.wiper', state:'on'})).ok);
  ok('cam.wiper off',     (await send({action:'cam.wiper', state:'off'})).ok);
  ok('cam.wiper',         (await send({action:'cam.wiper'})).ok);
  ok('cam.ircut on',      (await send({action:'cam.ircut', mode:'on'})).ok);
  ok('cam.ircut off',     (await send({action:'cam.ircut', mode:'off'})).ok);
  ok('cam.ircut auto',    (await send({action:'cam.ircut', mode:'auto'})).ok);
  ok('unknown action rejected', !(await send({action:'cam.nope'})).ok);

  // ---- verify mock side-effects ----
  if (!live) {
    const st = mock.state;
    ok('mock: stream 0 now enabled', st.streams['0'].enabled===1);
    ok('mock: overlay 1 now enabled', st.overlays.find(o=>o.id===1).enabled===1);
    ok('mock: defog toggled off→on (last write)', st.defog==='on'); // toggle flipped the prior "off"
    ok('mock: wiper triggered', st.wiper>=1);
    ok('mock: wiper off sent', st.wiperOff>=1);
    ok('mock: autofocus performed', st.afPerformed>=1);
    ok('mock: ircut set to auto (last)', st.ircut==='auto');
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  if (mock) mock.server.close();
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
