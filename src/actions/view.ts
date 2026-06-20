import streamDeck, {
    action,
    type KeyAction,
    type KeyDownEvent,
    type SendToPluginEvent,
    type JsonValue,
} from '@elgato/streamdeck';
import { parseSel, sendCmd, connFrom, type Catalog } from '../gateway';
import { LiveAction, type LiveSettings } from '../live-action';
import { datasourceEvent, respondDatasource, type DataItem } from '../ui';

function buildViewItems(c: Catalog): DataItem[] {
    if (!c.views.available) return [];
    return c.views.items.map((v) => ({
        value: JSON.stringify({ name: v.name, title: v.label || v.name }),
        label: v.label || v.name,
    }));
}

// CamSwitcher views are mutually exclusive (radio): only one is active at a time.
// We track the active view in memory across all View keys; pressing one lights it
// and clears the others. Resets to none on plugin restart.
let activeViewName: string | null = null;

@action({ UUID: 'com.4xsdev.axis-gateway.view' })
export class ViewAction extends LiveAction {
    protected async refresh(a: KeyAction<LiveSettings>, settings: LiveSettings): Promise<void> {
        const sel = parseSel(settings.sel);
        if (sel?.title) await a.setTitle(sel.title);
        this.paintLive(a, !!sel?.name && sel.name === activeViewName);
    }

    /** Active view = on air → solid highlight (key-on); others → idle. No red tally dot. */
    private paintLive(a: KeyAction<LiveSettings>, active: boolean): void {
        this.setLive(a, active);
    }

    /** Repaint every visible View key so only the active one is highlighted. */
    private async repaintAll(): Promise<void> {
        for (const a of this.actions) {
            if (!a.isKey()) continue;
            const sel = parseSel((await a.getSettings<LiveSettings>()).sel);
            this.paintLive(a, !!sel?.name && sel.name === activeViewName);
        }
    }

    override async onKeyDown(ev: KeyDownEvent<LiveSettings>): Promise<void> {
        const sel = parseSel(ev.payload.settings.sel);
        if (!sel?.name) {
            await ev.action.showAlert();
            return;
        }
        try {
            const r = await sendCmd({ action: 'view.switch', name: sel.name }, connFrom(ev.payload.settings));
            if (r.ok) {
                activeViewName = sel.name; // this view is now the active one
                await ev.action.showOk();
                await this.repaintAll(); // light this key, clear the rest
            } else {
                await ev.action.showAlert();
            }
        } catch (err) {
            streamDeck.logger.error(`view switch failed: ${String(err)}`);
            await ev.action.showAlert();
        }
    }

    override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, LiveSettings>): Promise<void> {
        if (datasourceEvent(ev.payload) === 'getViews') {
            const s = await ev.action.getSettings<LiveSettings>();
            await respondDatasource('getViews', buildViewItems, connFrom(s), ev.action);
        }
    }
}
