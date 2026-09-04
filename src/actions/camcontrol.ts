import streamDeck, { action, SingletonAction, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent, type DidReceiveSettingsEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/utils';
import { parseSel, sendCmd, connFrom, readDefog } from '../gateway';

type CamControlSettings = {
    sel?: string;
    wiperSeconds?: number; // timed wiper run length (default 5)
    cameraIp?: string;
    cameraPort?: number;
    cameraUser?: string;
    cameraPass?: string;
    cameraTls?: boolean;
} & JsonObject;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Camera optics control: autofocus, defog (set or toggle), wiper, IR cut filter.
// Most functions fire a single VAPIX command. Two are special:
//   - cam.defog.toggle reads the current state, flips it, and paints ON/OFF on the key.
//   - cam.wiper runs a timed sweep: turn on, count down on the key, then auto-off.
@action({ UUID: 'com.4xsdev.axis-gateway.camcontrol' })
export class CamControlAction extends SingletonAction<CamControlSettings> {
    private busy = new Set<string>(); // keys mid wiper countdown — ignore re-press

    private async paint(a: KeyAction<CamControlSettings>, settings: CamControlSettings): Promise<void> {
        const sel = parseSel(settings.sel);
        if (sel?.action === 'cam.defog.toggle') {
            let state: boolean | null = null;
            try {
                state = await readDefog(connFrom(settings));
            } catch {
                state = null;
            }
            await a.setTitle(state === null ? 'Defog' : state ? 'Defog\nON' : 'Defog\nOFF');
            return;
        }
        if (sel?.title) await a.setTitle(sel.title);
    }

    override async onWillAppear(ev: WillAppearEvent<CamControlSettings>): Promise<void> {
        if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings);
    }

    override onWillDisappear(ev: WillDisappearEvent<CamControlSettings>): void {
        this.busy.delete(ev.action.id);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CamControlSettings>): Promise<void> {
        if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings);
    }

    override async onKeyDown(ev: KeyDownEvent<CamControlSettings>): Promise<void> {
        const sel = parseSel(ev.payload.settings.sel);
        if (!sel?.action) {
            await ev.action.showAlert();
            return;
        }
        const conn = connFrom(ev.payload.settings);
        const { title, ...params } = sel;

        // Wiper: timed run with an on-key countdown, then auto-off.
        if (sel.action === 'cam.wiper') {
            await this.runWiper(ev, sel, conn);
            return;
        }

        try {
            const r = await sendCmd(params as Record<string, string>, conn);
            if (r.ok) {
                await ev.action.showOk();
                // A toggle changed state — repaint the key's ON/OFF label.
                if (sel.action === 'cam.defog.toggle') await this.paint(ev.action, ev.payload.settings);
            } else {
                streamDeck.logger.warn(`cam control ${sel.action} failed: ${r.error ?? 'unknown error'}`);
                await ev.action.showAlert();
            }
        } catch (err) {
            streamDeck.logger.error(`cam control failed: ${String(err)}`);
            await ev.action.showAlert();
        }
    }

    private async runWiper(
        ev: KeyDownEvent<CamControlSettings>,
        sel: ReturnType<typeof parseSel> & object,
        conn: ReturnType<typeof connFrom>,
    ): Promise<void> {
        const id = ev.action.id;
        if (this.busy.has(id)) return; // already running — ignore re-press
        this.busy.add(id);
        const secs = Math.min(60, Math.max(1, Number(ev.payload.settings.wiperSeconds) || 5));
        const wiperCmd = (state: 'on' | 'off'): Record<string, string> => {
            const p: Record<string, string> = { action: 'cam.wiper', state };
            if (sel.camera) p.camera = sel.camera;
            return p;
        };
        try {
            const on = await sendCmd(wiperCmd('on'), conn);
            if (!on.ok) {
                streamDeck.logger.warn(`wiper start failed: ${on.error ?? 'unknown error'}`);
                await ev.action.showAlert();
                return;
            }
            for (let r = secs; r >= 1; r--) {
                await ev.action.setTitle(`Wiper\n${r}s`);
                await delay(1000);
            }
            await sendCmd(wiperCmd('off'), conn);
            await ev.action.setTitle(sel.title ?? 'Wiper');
            await ev.action.showOk();
        } catch (err) {
            streamDeck.logger.error(`wiper run failed: ${String(err)}`);
            await ev.action.showAlert();
        } finally {
            this.busy.delete(id);
        }
    }
}
