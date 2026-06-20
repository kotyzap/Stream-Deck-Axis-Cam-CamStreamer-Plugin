import streamDeck, {
    action,
    SingletonAction,
    type KeyAction,
    type KeyDownEvent,
    type WillAppearEvent,
    type DidReceiveSettingsEvent,
    type SendToPluginEvent,
    type JsonValue,
    type JsonObject,
} from '@elgato/streamdeck';
import { parseSel, sendCmd, connFrom, type Catalog } from '../gateway';
import { datasourceEvent, respondDatasource, type DataItem } from '../ui';

type PresetSettings = {
    sel?: string;
    cameraIp?: string;
    cameraPort?: number;
    cameraUser?: string;
    cameraPass?: string;
    cameraTls?: boolean;
} & JsonObject;

function buildPresetItems(c: Catalog): DataItem[] {
    const items: DataItem[] = [
        { value: JSON.stringify({ action: 'ptz.home', title: 'Home' }), label: '⌂ Home' },
    ];
    if (c.ptz_presets.available) {
        for (const p of c.ptz_presets.items) {
            const sel: Record<string, string> = { action: 'ptz.preset', name: p.name, title: p.name };
            if (p.channel != null) sel.camera = String(p.channel);
            items.push({
                value: JSON.stringify(sel),
                label: p.channel != null ? `${p.name} (ch ${p.channel})` : p.name,
            });
        }
    }
    return items;
}

// Presets are radio PER VIEW AREA (camera channel): pressing one lights it and
// clears other presets on the SAME channel; presets on other channels are
// independent. In-memory, resets on plugin restart.
const activePreset = new Map<string, string>(); // channelKey -> active sel JSON
const channelKey = (sel: { camera?: string } | null): string => String(sel?.camera ?? '');

@action({ UUID: 'com.4xsdev.axis-gateway.preset' })
export class PresetAction extends SingletonAction<PresetSettings> {
    private async paint(a: KeyAction<PresetSettings>, settings: PresetSettings): Promise<void> {
        const sel = parseSel(settings.sel);
        if (sel?.title) await a.setTitle(sel.title);
        const on = !!sel && activePreset.get(channelKey(sel)) === settings.sel;
        await a.setState(on ? 1 : 0);
    }

    /** Repaint every visible preset key on the given channel (radio within channel). */
    private async repaintChannel(ck: string): Promise<void> {
        for (const a of this.actions) {
            if (!a.isKey()) continue;
            const s = await a.getSettings<PresetSettings>();
            const sel = parseSel(s.sel);
            if (sel && channelKey(sel) === ck) await a.setState(activePreset.get(ck) === s.sel ? 1 : 0);
        }
    }

    override async onWillAppear(ev: WillAppearEvent<PresetSettings>): Promise<void> {
        if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<PresetSettings>): Promise<void> {
        if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings);
    }

    override async onKeyDown(ev: KeyDownEvent<PresetSettings>): Promise<void> {
        const sel = parseSel(ev.payload.settings.sel);
        if (!sel?.action) {
            await ev.action.showAlert();
            return;
        }
        const { title, ...params } = sel;
        try {
            const r = await sendCmd(params as Record<string, string>, connFrom(ev.payload.settings));
            if (r.ok) {
                activePreset.set(channelKey(sel), ev.payload.settings.sel ?? '');
                await ev.action.showOk();
                await this.repaintChannel(channelKey(sel));
            } else {
                await ev.action.showAlert();
            }
        } catch (err) {
            streamDeck.logger.error(`preset failed: ${String(err)}`);
            await ev.action.showAlert();
        }
    }

    override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, PresetSettings>): Promise<void> {
        if (datasourceEvent(ev.payload) === 'getPresets') {
            const s = await ev.action.getSettings<PresetSettings>();
            await respondDatasource('getPresets', buildPresetItems, connFrom(s), ev.action);
        }
    }
}
