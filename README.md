# Axis Cam + CamStreamer — Stream Deck plugin

A native Elgato Stream Deck plugin (modern `@elgato/streamdeck` Node SDK, TypeScript)
that controls an Axis camera **directly** — the plugin talks straight to the camera's own
HTTP APIs over digest authentication.
<div align="center">
<img width="800" height="450" alt="StreamDeckAxisPlugin" src="https://github.com/user-attachments/assets/43c41a3f-ac71-4035-aefb-d7dcdeb058ce" />
</div>

```
Stream Deck key ─▶ plugin (Node, in the Stream Deck app) ─HTTP digest─▶ Axis camera
                                                                          ├─ VAPIX PTZ      (/axis-cgi/com/ptz.cgi)
                                                                          ├─ CamStreamer    (/local/camstreamer/…)
                                                                          ├─ CamOverlay     (/local/camoverlay/api/…)
                                                                          └─ CamSwitcher    (/local/camswitcher/…)
```

The camera is the single source of truth. Each action's Property Inspector reads the live
catalog from the camera (presets, streams, widgets, views) and offers a dropdown — you never
type a CGI URL. Stream and switcher keys then poll the camera and repaint themselves to show
what's actually on air.

## Actions (all keypad — work on every Stream Deck, incl. the keys of a Stream Deck +)

| Action | Tap does | Live state |
|---|---|---|
| **PTZ Preset** | Go to the chosen server preset (or Home) | — |
| **CamStreamer Stream** | Start / stop a stream | Shows **“Starting…”** while connecting, then a solid red tally dot while live |
| **CamOverlay Widget** | Show / hide a CamOverlay Custom Graphic | Key lit while the widget is visible |
| **CamSwitcher Source** | Switch to a CamSwitcher view | Key highlighted on the active view (no red dot) |

The red **tally dot** is exclusive to **CamStreamer streams** — it follows the broadcast
convention and is lit only while a stream is live, so you always know your output state at a
glance. CamSwitcher's active view is shown with a solid colour highlight instead.
<div align="center">
<img width="888" height="545" alt="Stream-Deck-Axis-CamStreamer-keys" src="https://github.com/user-attachments/assets/321f4f5c-9d20-483a-b6dc-7ae564d990db" />

</div>


## Requirements

- Stream Deck app **6.5+** (the plugin ships a Node 20 runtime via the manifest).
- Network reachability to the camera (LAN, or an `https://…device-connect.net` URL off-LAN).
- The relevant CamStreamer suite apps installed on the camera for those actions to appear
  (CamStreamer for streams, CamOverlay for widgets, CamSwitcher for views). PTZ needs only a
  PTZ-capable Axis camera.
- For building: Node.js 20+ (the Elgato CLI is optional — see packaging below).

## Configure

Drag any action onto a key, then in its Property Inspector set (once — these are shared
globally across all actions):

- **Camera IP** — e.g. `192.168.1.156` (or your `…device-connect.net` host for remote access).
- **User** / **Password** — a camera account. Digest auth is handled by the plugin; the
  credentials are stored in Stream Deck **global settings** on your machine and sent only to
  the camera.
- **Protocol** — `HTTP (port 80)` (default) or `HTTPS — untrusted cert (port 443)`. Pick HTTPS
  when the camera only exposes its CGIs over TLS; self-signed / untrusted certificates are
  accepted automatically. The port follows the protocol (80 / 443) unless you set one explicitly.

Then pick a preset / stream / widget / view from the dropdown. Done.

> Optional: the camera can export a `.streamDeckProfile` with keys pre-filled. Install this
> plugin once, double-click the profile, and the buttons are ready. Per-action settings take
> precedence over the global ones, so baked profiles and hand-configured keys coexist.

## Build & install (development)

```bash
npm install
npm run build          # rollup -> com.4xsdev.axis-gateway.sdPlugin/bin/plugin.js
```

Sideload into Stream Deck with the Elgato CLI (if installed):

```bash
streamdeck link com.4xsdev.axis-gateway.sdPlugin
streamdeck restart com.4xsdev.axis-gateway
# or, while editing:
npm run watch          # rebuilds on every change
```

## Package for distribution

With the Elgato CLI:

```bash
streamdeck pack com.4xsdev.axis-gateway.sdPlugin --force
```

Or without it (plain zip of the `.sdPlugin` folder, renamed):

```bash
npm run build
( cd com.4xsdev.axis-gateway.sdPlugin && zip -rX ../com.4xsdev.axis-gateway.streamDeckPlugin . -x '*/node_modules/*' '*.DS_Store' )
```

Double-click the resulting `com.4xsdev.axis-gateway.streamDeckPlugin` to install.

## How it talks to the camera

| When | Call | Purpose |
|---|---|---|
| Property Inspector opens | discovery reads of the product CGIs | Fill the dropdown (presets / streams / widgets / views) |
| Every 3 s while a stateful key is visible | cheap state read | Repaint the key (live / visible / active) |
| Key press | the matching native CGI | Execute the action |

Native endpoints used:

- **PTZ** — `/axis-cgi/com/ptz.cgi` (`gotoserverpresetname` / `gotoserverpresetno`, `move=home`).
- **CamStreamer** — `/local/camstreamer/stream_list.cgi`, `set_stream_enabled.cgi`.
- **CamOverlay** — `/local/camoverlay/api/services.cgi` (get / set).
- **CamSwitcher** — `/local/camswitcher/playlists.cgi`, `playlist_switch.cgi`.

Auth: HTTP **digest** (with Basic fallback) is implemented in `gateway.ts`, since Node's
`fetch` can't do digest. Self-signed TLS is accepted when the camera is addressed over HTTPS.

## Project layout

```
src/
  plugin.ts              entry — registers actions, connects
  gateway.ts             direct-to-camera HTTP client (digest) + discovery + Selection type
  ui.ts                  sdpi datasource responder
  live-action.ts         base class: per-instance polling timer, repaint, "Starting…" + tally state
  actions/
    preset.ts  stream.ts  overlay.ts  view.ts
com.4xsdev.axis-gateway.sdPlugin/
  manifest.json          4 keypad actions
  bin/plugin.js          rollup output (built)
  ui/*.html              Property Inspectors (sdpi-components)
  imgs/...               icons
```

## Notes & caveats

- **sdpi-components** is loaded from its CDN (`https://sdpi-components.dev/releases/v4/…`) in
  the PI HTML. For fully offline machines, download `sdpi-components.js` next to the HTML files
  and change the `<script src>` to a relative path.
- **Live-state polling** is every 3 s per visible key (`POLL_MS` in `live-action.ts`); it only
  runs while the key is on screen (started in `onWillAppear`, cleared in `onWillDisappear`).
- This build is **keypad-only**. Momentary/continuous PTZ and Stream Deck + dial control are
  deliberately deferred.
- Credentials live in Stream Deck **global settings** (local to your machine), and are sent
  only to the camera you configure.
```

## Changelog

- **1.0.2** — HTTPS added. A **Protocol** selector in each action's Property Inspector lets you
  choose `HTTP (port 80)` or `HTTPS — untrusted cert (port 443)`; self-signed / untrusted
  certificates are accepted, and the port follows the protocol unless set explicitly.
  Preset keys now light as a radio group **per camera + view area** (Home included). The red
  tally dot is now exclusive to CamStreamer live streams; the active CamSwitcher view shows a
  colour highlight instead. Off keys gained a coloured edge stroke so actions stay
  distinguishable when the deck washes the tiles out. The "Buy Me a Coffee" action was removed.
- **1.0.0** — Initial release: PTZ presets, CamStreamer streams, CamOverlay widgets,
  CamSwitcher sources with live key state.
