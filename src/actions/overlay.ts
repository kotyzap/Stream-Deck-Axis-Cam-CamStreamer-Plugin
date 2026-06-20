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

function buildOverlayItems(c: Catalog): DataItem[] {
    if (!c.overlay_services.available) return [];
    return c.overlay_services.items.map((s) => ({
        value: JSON.stringify({ service_id: s.service_id, title: s.name }),
        label: s.name,
    }));
}

@action({ UUID: 'com.4xsdev.axis-gateway.overlay' })
export class OverlayAction extends LiveAction {
    // CamOverlay show/hide is instant, so no "pending" animation — repaint immediately.
    protected async refresh(a: KeyAction<LiveSettings>, settings: LiveSettings): Promise<void> {
        const sel = parseSel(settings.sel);
        if (sel?.title) await a.setTitle(sel.title);
        if (sel?.service_id == null) {
            await a.setState(0);
            return;
        }
        const state = await fetchState(connFrom(settings));
        await a.setState(state.overlays[String(sel.service_id)] === true ? 1 : 0);
    }

    override async onKeyDown(ev: KeyDownEvent<LiveSettings>): Promise<void> {
        const sel = parseSel(ev.payload.settings.sel);
        if (sel?.service_id == null) {
            await ev.action.showAlert();
            return;
        }
        const conn = connFrom(ev.payload.settings);
        try {
            const state = await fetchState(conn);
            const currentlyOn = state.overlays[String(sel.service_id)] === true;
            const r = await sendCmd({
                action: 'overlay.toggle',
                service_id: String(sel.service_id),
                enabled: currentlyOn ? '0' : '1',
            }, conn);
            if (r.ok) await ev.action.showOk();
            else await ev.action.showAlert();
        } catch (err) {
            streamDeck.logger.error(`overlay toggle failed: ${String(err)}`);
            await ev.action.showAlert();
        }
        if (ev.action.isKey()) await this.refresh(ev.action, ev.payload.settings);
    }

    override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, LiveSettings>): Promise<void> {
        if (datasourceEvent(ev.payload) === 'getOverlays') {
            const s = await ev.action.getSettings<LiveSettings>();
            await respondDatasource('getOverlays', buildOverlayItems, connFrom(s), ev.action);
        }
    }
}
