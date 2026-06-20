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
    // Home is the home position of the DOMINANT view area (View Area 1 / Main) —
    // the lowest discovered channel. Tagging it with that channel keeps Home in the
    // same radio group as that view area's presets and leaves other view areas alone.
    let dominant: number | null = null;
    if (c.ptz_presets.available) {
        for (const p of c.ptz_presets.items) {
            if (p.channel != null && (dominant == null || p.channel < dominant)) dominant = p.channel;
        }
    }
    const homeSel: Record<string, string> = { action: 'ptz.home', title: 'Home' };
    if (dominant != null) homeSel.camera = String(dominant);

    const items: DataItem[] = [
        { value: JSON.stringify(homeSel), label: dominant != null ? `⌂ Home (ch ${dominant})` : '⌂ Home' },
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

// Presets are radio PER CAMERA + VIEW AREA (PTZ channel): pressing a preset (or Home)
// lights it and clears other presets in the SAME camera AND same view area only.
// Each view area has its own independent PTZ, so other view areas are never touched.
// State is in-memory and resets on plugin restart.
const activePreset = new Map<string, string>(); // `${cameraKey}::${channelKey}` -> active sel JSON

/** Camera identity for the radio scope (per-action IP, falling back to '' = shared global). */
const cameraKey = (s: PresetSettings): string => String(s.cameraIp ?? '');
/** View area within a camera (PTZ channel; '' when the device is single-channel). */
const channelKey = (sel: { camera?: string } | null): string => String(sel?.camera ?? '');
/** Radio group: one active preset per camera + view area. */
const groupKey = (s: PresetSettings, sel: { camera?: string } | null): string =>
    `${cameraKey(s)}::${channelKey(sel)}`;

/** Whether a given preset/Home key is the currently-active one for its camera + view area. */
function isActive(settings: PresetSettings, sel: ReturnType<typeof parseSel>): boolean {
    return !!sel && activePreset.get(groupKey(settings, sel)) === settings.sel;
}

@action({ UUID: 'com.4xsdev.axis-gateway.preset' })
export class PresetAction extends SingletonAction<PresetSettings> {
    private async paint(a: KeyAction<PresetSettings>, settings: PresetSettings): Promise<void> {
        const sel = parseSel(settings.sel);
        if (sel?.title) await a.setTitle(sel.title);
        await a.setState(isActive(settings, sel) ? 1 : 0);
    }

    /** Repaint every visible preset key in the given radio group (one camera + view area). */
    private async repaintGroup(gk: string): Promise<void> {
        for (const a of this.actions) {
            if (!a.isKey()) continue;
            const s = await a.getSettings<PresetSettings>();
            const sel = parseSel(s.sel);
            if (groupKey(s, sel) !== gk) continue;
            await a.setState(isActive(s, sel) ? 1 : 0);
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
                // Win the radio slot for this camera + view area only (Home included).
                const gk = groupKey(ev.payload.settings, sel);
                activePreset.set(gk, ev.payload.settings.sel ?? '');
                await ev.action.showOk();
                await this.repaintGroup(gk);
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
