import streamDeck, {
    SingletonAction,
    type Action,
    type KeyAction,
    type JsonObject,
    type WillAppearEvent,
    type WillDisappearEvent,
    type DidReceiveSettingsEvent,
} from '@elgato/streamdeck';

const POLL_MS = 3000;
// While a start/stop is in flight we poll faster and animate the key so the user
// gets immediate feedback instead of staring at an unchanged key for ~10s.
const BLINK_MS = 500;
const PENDING_CHECK_EVERY = 3; // check real state every 3 blinks (~1.5s)
const PENDING_TIMEOUT_MS = 30000;

type Pending = {
    target: boolean; // desired on-state we're waiting for
    label: string; // "Starting" / "Stopping"
    deadline: number;
    frame: number;
    timer: ReturnType<typeof setInterval>;
};

export type LiveSettings = {
    sel?: string;
    cameraIp?: string;
    cameraPort?: number;
    cameraUser?: string;
    cameraPass?: string;
    cameraTls?: boolean;
} & JsonObject;

/**
 * Base class for actions whose key reflects live camera state. Manages a polling
 * timer per visible instance (keyed by action id) and re-paints on settings change.
 * Subclasses implement {@link refresh} to map current state onto the key, and may
 * implement {@link currentOn} to enable the animated "pending" transition shown
 * between a key press and the camera reporting the new state.
 */
export abstract class LiveAction<T extends LiveSettings = LiveSettings> extends SingletonAction<T> {
    private timers = new Map<string, ReturnType<typeof setInterval>>();
    private pending = new Map<string, Pending>();

    /**
     * Live/active indicator: a solid red tally dot (key state 1). Reliable — no
     * timer to stall. Requires state 1 in the manifest to carry the red dot.
     */
    protected setLive(action: KeyAction<T>, live: boolean): void {
        void action.setState(live ? 1 : 0);
    }

    /** Paint the key from current gateway state + the action's selection. */
    protected abstract refresh(action: KeyAction<T>, settings: T): Promise<void>;

    /** Current on-state of the selected item, or null if unknown. Default: no pending support. */
    protected async currentOn(_settings: T): Promise<boolean | null> {
        return null;
    }

    /**
     * Enter the animated "pending" state: blink the key and show "Starting…/Stopping…"
     * until the camera reports {@link target}, or until a timeout. Call this from
     * onKeyDown after the start/stop command was accepted.
     */
    protected beginPending(action: KeyAction<T>, settings: T, target: boolean): void {
        this.clearPending(action.id);
        const label = target ? 'Starting' : 'Stopping';
        const p: Pending = { target, label, deadline: Date.now() + PENDING_TIMEOUT_MS, frame: 0, timer: 0 as never };
        p.timer = setInterval(() => void this.pendingTick(action, settings), BLINK_MS);
        this.pending.set(action.id, p);
        void this.paintPending(action, p); // paint frame 0 immediately
    }

    private async pendingTick(action: KeyAction<T>, settings: T): Promise<void> {
        const p = this.pending.get(action.id);
        if (!p) return;
        p.frame++;
        // Periodically read the real state; finish when target reached or timed out.
        if (p.frame % PENDING_CHECK_EVERY === 0) {
            let actual: boolean | null = null;
            try {
                actual = await this.currentOn(settings);
            } catch {
                actual = null;
            }
            if (actual === p.target) {
                this.clearPending(action.id);
                await this.refresh(action, settings);
                return;
            }
            if (Date.now() > p.deadline) {
                this.clearPending(action.id);
                await this.refresh(action, settings);
                await action.showAlert();
                return;
            }
        }
        await this.paintPending(action, p);
    }

    private async paintPending(action: KeyAction<T>, p: Pending): Promise<void> {
        try {
            const dots = '.'.repeat(p.frame % 4);
            await action.setTitle(`${p.label}${dots}`);
            // Blink between the target colour and off to draw attention.
            const lit = p.frame % 2 === 0;
            await action.setState(lit ? (p.target ? 1 : 0) : (p.target ? 0 : 1));
        } catch {
            /* key may have disappeared */
        }
    }

    protected clearPending(id: string): void {
        const p = this.pending.get(id);
        if (p) {
            clearInterval(p.timer);
            this.pending.delete(id);
        }
    }

    override async onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
        await this.tick(ev.action, ev.payload.settings);
        const id = ev.action.id;
        this.clear(id);
        this.timers.set(id, setInterval(() => void this.tick(ev.action), POLL_MS));
    }

    override onWillDisappear(ev: WillDisappearEvent<T>): void {
        this.clear(ev.action.id);
        this.clearPending(ev.action.id);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<T>): Promise<void> {
        await this.tick(ev.action, ev.payload.settings);
    }

    private clear(id: string): void {
        const t = this.timers.get(id);
        if (t) {
            clearInterval(t);
            this.timers.delete(id);
        }
    }

    private async tick(action: Action<T>, settings?: T): Promise<void> {
        try {
            if (!action.isKey()) return;
            // Don't fight the pending animation; it manages the key until it resolves.
            if (this.pending.has(action.id)) return;
            const s = settings ?? (await action.getSettings<T>());
            await this.refresh(action, s);
        } catch (err) {
            streamDeck.logger.error(`${this.manifestId} refresh failed: ${String(err)}`);
        }
    }
}
