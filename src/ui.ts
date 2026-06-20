import streamDeck, { type JsonValue, type Action, type JsonObject } from '@elgato/streamdeck';
import { discover, resolveConn, isLoopbackOrEmpty, type Catalog, type Conn } from './gateway';

export type DataItem = { value: string; label?: string; disabled?: boolean };

/** Extract the datasource event name sent by an sdpi-components <sdpi-select>. */
export function datasourceEvent(payload: JsonValue): string | undefined {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const ev = (payload as Record<string, unknown>).event;
        return typeof ev === 'string' ? ev : undefined;
    }
    return undefined;
}

/**
 * Fetch the gateway catalog, build dropdown items, and push them to the current
 * property inspector in the shape sdpi-components expects: { event, items }.
 */
export async function respondDatasource(
    eventName: string,
    build: (c: Catalog) => DataItem[],
    conn?: Conn,
    action?: Action<JsonObject>,
): Promise<void> {
    const c = await resolveConn(conn);

    // No usable camera IP yet (empty or loopback) — prompt instead of erroring.
    if (isLoopbackOrEmpty(c.cameraIp)) {
        await streamDeck.ui.current?.sendToPropertyInspector({ event: eventName, items: [{ value: '', label: 'Enter LAN IP', disabled: true }] });
        return;
    }

    let items: DataItem[];
    try {
        const { catalog } = await discover(c);
        items = build(catalog);
        if (items.length === 0) items = [{ value: '', label: 'Nothing found', disabled: true }];
    } catch (err) {
        streamDeck.logger.error(`datasource ${eventName} failed: ${String(err)}`);
        items = [{ value: '', label: `⚠ ${err instanceof Error ? err.message : 'error'}`, disabled: true }];
    }
    await streamDeck.ui.current?.sendToPropertyInspector({ event: eventName, items });

    // Pre-select the first real item if this key hasn't been configured yet, so it
    // works immediately without the user opening the dropdown.
    if (action) {
        try {
            const settings = (await action.getSettings()) as Record<string, unknown>;
            if (!settings.sel) {
                const first = items.find((i) => i.value && !i.disabled);
                if (first) await action.setSettings({ ...settings, sel: first.value });
            }
        } catch (err) {
            streamDeck.logger.error(`default-select ${eventName} failed: ${String(err)}`);
        }
    }
}
