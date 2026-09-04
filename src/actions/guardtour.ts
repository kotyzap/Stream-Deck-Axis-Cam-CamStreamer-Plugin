import streamDeck, { action, type KeyAction, type KeyDownEvent, type SendToPluginEvent } from '@elgato/streamdeck';
import type { JsonValue } from '@elgato/utils';
import { fetchGuardTourState, parseSel, sendCmd, connFrom, type Catalog } from '../gateway';
import { LiveAction, type LiveSettings } from '../live-action';
import { datasourceEvent, respondDatasource, type DataItem } from '../ui';
import { groupKey, clearActivePreset, registerRepaint, fireRepaint } from '../ptz-radio';

function buildGuardTourItems(c: Catalog): DataItem[] {
    if (!c.guard_tours.available) return [];
    return c.guard_tours.items.map((t) => {
        // camera = CamNbr ties the tour into the SAME radio group as that view area's
        // presets, so a preset and this tour are mutually exclusive.
        const sel: Record<string, string> = { action: 'guardtour.start', guardtour_id: t.id, title: t.name };
        if (t.channel != null) sel.camera = String(t.channel);
        return {
            value: JSON.stringify(sel),
            label: t.channel != null ? `↻ ${t.name} (ch ${t.channel})` : `↻ ${t.name}`,
        };
    });
}

// AXIS Guarded Tour key: lit (state 1) = the tour is actually Running on the camera.
// State is read live from the camera (survives plugin restart). Tours share the PTZ
// radio group with presets — starting one clears the active preset in its group.
@action({ UUID: 'com.4xsdev.axis-gateway.guardtour' })
export class GuardTourAction extends LiveAction {
    constructor() {
        super();
        // Repaint our keys when a preset (or another tour) wins the group: re-read the
        // camera so a stopped tour goes dark.
        registerRepaint((gk) => this.repaintGroup(gk));
    }

    protected async currentOn(settings: LiveSettings): Promise<boolean | null> {
        const sel = parseSel(settings.sel);
        if (!sel?.guardtour_id) return null;
        const state = await fetchGuardTourState(connFrom(settings));
        return state[sel.guardtour_id] === true;
    }

    protected async refresh(a: KeyAction<LiveSettings>, settings: LiveSettings): Promise<void> {
        const sel = parseSel(settings.sel);
        if (sel?.title) await a.setTitle(sel.title);
        if (!sel?.guardtour_id) {
            await a.setState(0);
            return;
        }
        this.setLive(a, (await this.currentOn(settings)) === true);
    }

    /** Re-read camera state for every visible tour key in the given radio group. */
    private async repaintGroup(gk: string): Promise<void> {
        for (const a of this.actions) {
            if (!a.isKey()) continue;
            if (this.isPending(a.id)) continue; // its own animation owns the key
            const s = await a.getSettings<LiveSettings>();
            const sel = parseSel(s.sel);
            if (groupKey(s, sel) !== gk) continue;
            await this.refresh(a, s);
        }
    }

    override async onKeyDown(ev: KeyDownEvent<LiveSettings>): Promise<void> {
        const sel = parseSel(ev.payload.settings.sel);
        if (!sel?.guardtour_id) {
            await ev.action.showAlert();
            return;
        }
        const conn = connFrom(ev.payload.settings);
        try {
            // Toggle: running -> stop, otherwise start. Starting also stops other tours
            // on this channel (handled in the gateway) for true one-tour-per-channel.
            const running = (await this.currentOn(ev.payload.settings)) === true;
            const target = !running;
            const r = await sendCmd(
                {
                    action: target ? 'guardtour.start' : 'guardtour.stop',
                    guardtour_id: sel.guardtour_id,
                    ...(sel.camera ? { camera: sel.camera } : {}),
                },
                conn,
            );
            if (r.ok) {
                const gk = groupKey(ev.payload.settings, sel);
                // Starting a tour takes the slot from any active preset in this group.
                if (target) clearActivePreset(gk);
                if (ev.action.isKey()) this.beginPending(ev.action, ev.payload.settings, target);
                // Refresh preset keys (and sibling tour keys) in the group.
                await fireRepaint(gk);
            } else {
                await ev.action.showAlert();
            }
        } catch (err) {
            streamDeck.logger.error(`guard tour toggle failed: ${String(err)}`);
            await ev.action.showAlert();
        }
    }

    override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, LiveSettings>): Promise<void> {
        if (datasourceEvent(ev.payload) === 'getGuardTours') {
            const s = await ev.action.getSettings<LiveSettings>();
            await respondDatasource('getGuardTours', buildGuardTourItems, connFrom(s), ev.action);
        }
    }
}
