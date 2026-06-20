import streamDeck, {
    action,
    type KeyAction,
    type KeyDownEvent,
    type SendToPluginEvent,
    type JsonValue,
} from '@elgato/streamdeck';
import { fetchState, parseSel, sendCmd, connFrom, type Catalog } from '../gateway';
import { LiveAction, type LiveSettings } from '../live-action';
import { datasourceEvent, respondDatasource, type DataItem } from '../ui';

function buildStreamItems(c: Catalog): DataItem[] {
    if (!c.streams.available) return [];
    return c.streams.items.map((s) => ({
        value: JSON.stringify({ stream_id: s.stream_id, title: s.name }),
        label: s.name,
    }));
}

@action({ UUID: 'com.4xsdev.axis-gateway.stream' })
export class StreamAction extends LiveAction {
    protected async currentOn(settings: LiveSettings): Promise<boolean | null> {
        const sel = parseSel(settings.sel);
        if (sel?.stream_id == null) return null;
        const state = await fetchState(connFrom(settings));
        return state.streams[String(sel.stream_id)] === true;
    }

    protected async refresh(a: KeyAction<LiveSettings>, settings: LiveSettings): Promise<void> {
        const sel = parseSel(settings.sel);
        if (sel?.title) await a.setTitle(sel.title);
        if (sel?.stream_id == null) {
            await a.setState(0);
            return;
        }
        // Live = solid red tally dot (state 1); idle = off (state 0).
        this.setLive(a, (await this.currentOn(settings)) === true);
    }

    override async onKeyDown(ev: KeyDownEvent<LiveSettings>): Promise<void> {
        const sel = parseSel(ev.payload.settings.sel);
        if (sel?.stream_id == null) {
            await ev.action.showAlert();
            return;
        }
        const conn = connFrom(ev.payload.settings);
        try {
            const target = !((await this.currentOn(ev.payload.settings)) === true);
            const r = await sendCmd({
                action: 'stream.set',
                stream_id: String(sel.stream_id),
                enabled: target ? '1' : '0',
            }, conn);
            if (r.ok) {
                // Animate "Starting…/Stopping…" until the camera reports the new state.
                if (ev.action.isKey()) this.beginPending(ev.action, ev.payload.settings, target);
            } else {
                await ev.action.showAlert();
            }
        } catch (err) {
            streamDeck.logger.error(`stream toggle failed: ${String(err)}`);
            await ev.action.showAlert();
        }
    }

    override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, LiveSettings>): Promise<void> {
        if (datasourceEvent(ev.payload) === 'getStreams') {
            const s = await ev.action.getSettings<LiveSettings>();
            await respondDatasource('getStreams', buildStreamItems, connFrom(s), ev.action);
        }
    }
}
