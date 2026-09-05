#!/usr/bin/env python3
"""Generates docs/index.html (GitHub Pages) for Camera Deck for Axis & CamStreamer.
Uses the repo's existing real screenshots in docs/img. Pavel Kotyza <kotyza@gmail.com> — https://www.4xs.dev
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = "https://github.com/kotyzap/Stream-Deck-Axis-Cam-CamStreamer-Plugin"
DL = f"{REPO}/releases/latest/download/com.4xsdev.axis-gateway-kofi.streamDeckPlugin"

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400&display=swap">'

CSS = """
:root{--bg:#f7f5f1;--bg2:#efece6;--fg:#1c1b19;--fg2:#5f5c56;--line:#e0dcd4;--card:#ffffff;--accent:#0e8a7e;--accent-fg:#ffffff;--deck:#1c1c1e}
:root:not([data-theme=light]) {}
[data-theme=dark]{--bg:#161615;--bg2:#1f1f1e;--fg:#f2f0ec;--fg2:#a09c94;--line:#2c2b29;--card:#1d1d1c;--accent:#2fd4c4;--accent-fg:#0b1f1c;--deck:#141414}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:"IBM Plex Sans",system-ui,-apple-system,sans-serif;font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}a:hover{color:var(--fg)}
h1,h2,h3{font-family:"Space Grotesk","Helvetica Neue",Arial,sans-serif;letter-spacing:-0.02em;margin:0}
code,kbd{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:0.9em}
kbd{background:var(--bg2);border:1px solid var(--line);border-radius:6px;padding:1px 7px}
.wrap{max-width:1040px;margin:0 auto;padding:0 28px}
nav{display:flex;align-items:center;justify-content:space-between;height:68px}
.brand{display:flex;align-items:center;gap:12px;font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:18px;color:var(--fg)}
.mark{width:30px;height:30px;border-radius:8px;background:#0e8a7e;color:#fff;display:grid;place-items:center}
.navlinks{display:flex;align-items:center;gap:22px;font-size:15px;color:var(--fg2)}
.navlinks a{color:var(--fg2)}.navlinks a:hover{color:var(--fg)}
.toggle{width:40px;height:26px;border-radius:13px;border:1px solid var(--line);background:var(--bg2);position:relative;cursor:pointer;padding:0}
.toggle::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--fg);transition:left .15s}
[data-theme=dark] .toggle::after{left:17px}
.hero{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:40px;align-items:center;padding:48px 0 56px}
.hero h1{font-size:44px;line-height:1.05;font-weight:700}
.hero p{font-size:19px;color:var(--fg2);margin:20px 0 28px}
.cta{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:var(--accent-fg);font-weight:500;padding:12px 16px;border-radius:10px;font-size:15px}
.btn:hover{color:var(--accent-fg);filter:brightness(1.08)}
.btn.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}
.meta{font-size:14px;color:var(--fg2)}
.hero img{width:100%;height:auto;display:block;border-radius:14px;border:1px solid var(--line)}
section{padding:56px 0;border-top:1px solid var(--line)}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
h2{font-size:32px;font-weight:700;margin-bottom:12px}
.lead{font-size:18px;color:var(--fg2);max-width:660px;margin:0 0 32px}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px}
.card h3{font-size:18px;margin-bottom:8px}
.card p{margin:0;color:var(--fg2);font-size:15.5px}
.num{font-family:"IBM Plex Mono",monospace;color:var(--accent);font-size:13px;margin-bottom:10px}
.cardlink{display:block;text-decoration:none;color:inherit;transition:border-color .15s}
.cardlink:hover{border-color:var(--accent)}.cardlink h3{color:var(--fg)}
table{width:100%;border-collapse:collapse;font-size:15.5px}
td{padding:12px 0;border-top:1px solid var(--line);vertical-align:top}
td:first-child{font-weight:500;white-space:nowrap;padding-right:22px}
td:last-child{color:var(--fg2)}
.shot{background:var(--deck);border-radius:16px;padding:18px;margin:0 0 24px}
.shot img{display:block;width:100%;max-width:820px;margin:0 auto;height:auto;border-radius:8px}
.arch{background:var(--deck);color:#e8e8ea;border-radius:14px;padding:22px 24px;overflow-x:auto;font-family:"IBM Plex Mono",monospace;font-size:13.5px;line-height:1.5}
.arch b{color:var(--accent)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
.two img{width:100%;height:auto;border-radius:12px;border:1px solid var(--line);display:block}
footer{padding:36px 0 48px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:14px;color:var(--fg2)}
footer a{color:var(--fg2)}footer a:hover{color:var(--fg)}
@media (max-width:820px){.hero{grid-template-columns:1fr;padding-top:24px}.hero h1{font-size:38px}.grid3,.two{grid-template-columns:1fr}.navlinks span{display:none}}
"""

GH_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>'
DL_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>'
MARK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.5A2.5 2.5 0 0 1 4.5 6h9A2.5 2.5 0 0 1 16 8.5v7A2.5 2.5 0 0 1 13.5 18h-9A2.5 2.5 0 0 1 2 15.5z"/><path d="M16 10l5-3v10l-5-3"/></svg>'

# Cross-links to the other plugins in the family.
FAMILY = [
    ("claude",  "Deck for Claude",                       "Answer permission prompts, replies, shortcuts & status for the Claude desktop app", "https://kotyzap.github.io/Stream-Deck-Claude-Plugin/"),
    ("axis",    "Camera Deck for Axis &amp; CamStreamer", "PTZ, presets, overlays and CamStreamer/CamSwitcher control for Axis cameras",       "https://github.com/kotyzap/Stream-Deck-Axis-Cam-CamStreamer-Plugin"),
    ("acs-edge","Deck for AXIS Camera Station Edge",      "Recording playback, PTZ and view controls for ACS Edge",                            "https://kotyzap.github.io/Stream-Deck-ACS-Edge-Plugin/"),
    ("acs-pro", "Deck for AXIS Camera Station Pro &amp; 5","Playback, cameras, PTZ presets and any hotkey for ACS 5 &amp; Pro",                 "https://kotyzap.github.io/Stream-Deck-ACS-Pro-Plugin/"),
    ("genetec", "Deck for Genetec Security Desk",         "Playback, alarms, tiles, PTZ, doors and any camera by logical ID for Security Desk", "https://kotyzap.github.io/Stream-Deck-Genetec-Plugin/"),
]
def more_cards(self_key):
    return "\n".join(
        f'      <a class="card cardlink" href="{url}"><h3>{name} ↗</h3><p>{desc}</p></a>'
        for key, name, desc, url in FAMILY if key != self_key)

ARCH = ('Stream Deck key ─▶ plugin <span style="color:#a1a1a6">(Node, in the Stream Deck app)</span> ─ HTTP digest ─▶ Axis camera\n'
        '                                                              ├─ <b>VAPIX PTZ</b>      /axis-cgi/com/ptz.cgi\n'
        '                                                              ├─ <b>CamStreamer</b>   /local/camstreamer/…\n'
        '                                                              ├─ <b>CamOverlay</b>    /local/camoverlay/api/…\n'
        '                                                              └─ <b>CamSwitcher</b>   /local/camswitcher/…')

HTML = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Camera Deck for Axis &amp; CamStreamer</title>
<meta name="description" content="Stream Deck plugin that controls an Axis camera directly over HTTP: PTZ presets, guarded tours, CamStreamer streams, CamOverlay widgets, CamSwitcher views and camera optics — with live-state keys.">
{FONTS}
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
  <nav>
    <a class="brand" href="#"><span class="mark">{MARK}</span><span>Camera Deck for Axis &amp; CamStreamer</span></a>
    <div class="navlinks"><a href="#actions">Actions</a><a href="#how">How it works</a><a href="#decks">Decks</a><a href="#install">Install</a><a href="{REPO}">{GH_ICON}</a><button class="toggle" id="theme" aria-label="Toggle dark mode" onclick="toggleTheme()"></button></div>
  </nav>

  <div class="hero">
    <div>
      <h1>Your Axis camera on physical keys.</h1>
      <p>PTZ presets, guarded tours, CamStreamer streams, CamOverlay widgets, CamSwitcher views and camera optics — on a Stream Deck. The plugin talks straight to the camera; every key reads the live catalog and repaints itself to show what's actually on air.</p>
      <div class="cta">
        <a class="btn" href="{DL}">{DL_ICON}Download plugin</a>
        <a class="btn ghost" href="{REPO}">Source on GitHub</a>
      </div>
      <p class="meta" style="margin-top:16px">Windows 10+ · macOS 12+ · Stream Deck 6.9+. Free and open source (MIT). No cloud, no extra software — just the camera's IP and login.</p>
    </div>
    <img src="img/Stream-Deck-Axis-CamStreamer-keys.png" alt="A Stream Deck running the Axis & CamStreamer keys: PTZ presets, guarded tour, streams, overlays, views and camera control">
  </div>

  <section id="actions">
    <div class="eyebrow">Six actions</div>
    <h2>Drag what you need — keys that know their state.</h2>
    <p class="lead">Each action's Property Inspector reads the live catalog from the camera (presets, streams, widgets, views) and offers a dropdown — you never type a CGI URL. Stream and switcher keys poll the camera and repaint themselves.</p>
    <table>
      <tr><td>PTZ Preset</td><td>Go to a server preset (or Home). Lit as a radio group per camera and view area.</td></tr>
      <tr><td>AXIS Guarded Tour</td><td>Start / stop a Guarded Tour; shares the PTZ radio group with presets, reflects the running state.</td></tr>
      <tr><td>CamStreamer Stream</td><td>Start / stop a stream. Shows “Starting…”, then a solid red tally dot while live — broadcast convention, so you always know your output state.</td></tr>
      <tr><td>CamOverlay Widget</td><td>Show / hide a CamOverlay Custom Graphic; key lit while the widget is visible.</td></tr>
      <tr><td>CamSwitcher Source</td><td>Switch to a CamSwitcher view; the active view is highlighted with a solid colour.</td></tr>
      <tr><td>Cam Control</td><td>Camera optics — one-push autofocus, defog (on/off/toggle), timed wiper with an on-key countdown, IR-cut filter (on/off/auto). Fixed and PTZ cameras via automatic endpoint fallback.</td></tr>
    </table>
    <div class="shot" style="margin-top:28px"><img src="img/StreamDeckAxisPlugin.gif" alt="The plugin in action: keys reflecting live stream and view state"></div>
  </section>

  <section id="how">
    <div class="eyebrow">How it works</div>
    <h2>Straight to the camera.</h2>
    <p class="lead">No cloud and no middle-man service — the plugin speaks the camera's own HTTP APIs over digest authentication on your LAN. The camera is the single source of truth.</p>
    <div class="arch">{ARCH}</div>
    <p class="meta" style="margin-top:16px">Credentials live in Stream Deck's settings; a per-key override lets a profile bake in a specific camera. Commands don't retry on a 401, so a wrong password won't trip the camera's auth firewall. Works on AXIS OS 10 through 12.</p>
  </section>

  <section id="decks">
    <div class="eyebrow">Every deck size</div>
    <h2>Works on any Stream Deck.</h2>
    <p class="lead">All actions are keypad actions, so they work on a Stream Deck Mini, MK.2, XL, Neo, and the keys of a Stream Deck +. Drag the actions you use onto your own layout.</p>
    <div class="shot"><img src="img/Elgato_Stream_Decks-HW.jpg" alt="The Stream Deck hardware family — Mini, MK.2 and XL"></div>
  </section>

  <section id="install">
    <div class="eyebrow">Install</div>
    <h2>Three steps.</h2>
    <div class="grid3">
      <div class="card"><div class="num">1</div><h3>Download and double-click</h3><p><code>com.4xsdev.axis-gateway-kofi.streamDeckPlugin</code> — Stream Deck installs the <strong>Camera Deck for Axis &amp; CamStreamer</strong> action group.</p></div>
      <div class="card"><div class="num">2</div><h3>Enter the camera</h3><p>Set the camera IP, user and password once in the plugin's settings (digest auth, LAN). CamStreamer / CamOverlay / CamSwitcher actions need those ACAPs installed on the camera.</p></div>
      <div class="card"><div class="num">3</div><h3>Add keys</h3><p>Drag an action onto a key and pick a preset, stream, widget or view from the dropdown — read live from the camera. Stream and view keys then show their state.</p></div>
    </div>
    <div class="two" style="margin-top:26px">
      <img src="img/Preset-Setup.png" alt="Choosing a PTZ preset from the live catalog">
      <img src="img/Plugin-CamSwitcher-View-Setup.png" alt="Choosing a CamSwitcher view">
    </div>
  </section>

  <section id="more">
    <div class="eyebrow">More from 4xs.dev</div>
    <h2>Other Stream Deck plugins.</h2>
    <p class="lead">Physical keys for the tools you already use. All free and open source.</p>
    <div class="grid3">
{more_cards("axis")}
    </div>
  </section>

  <footer>
    <div>Pavel Kotyza · <a href="https://www.4xs.dev">4xs.dev</a> · MIT License · <a href="https://ko-fi.com/K3K6RR4LY">Buy me a Ko-fi</a></div>
    <div>Independent project; not affiliated with Axis Communications, CamStreamer or Elgato.</div>
  </footer>
</div>
<script>
(function(){{var t=null;try{{t=localStorage.getItem('theme')}}catch(e){{}}
if(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)t='dark';
if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}})();
function toggleTheme(){{var r=document.documentElement,d=r.getAttribute('data-theme')==='dark';
if(d)r.removeAttribute('data-theme');else r.setAttribute('data-theme','dark');
try{{localStorage.setItem('theme',d?'light':'dark')}}catch(e){{}}}}
</script>
</body>
</html>
"""

if __name__ == "__main__":
    (ROOT / "docs").mkdir(exist_ok=True)
    (ROOT / "docs" / "index.html").write_text(HTML)
    print("wrote", ROOT / "docs" / "index.html", len(HTML), "bytes")
