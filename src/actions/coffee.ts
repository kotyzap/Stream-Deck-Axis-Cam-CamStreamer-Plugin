import streamDeck, {
    action,
    SingletonAction,
    type KeyDownEvent,
    type JsonObject,
} from '@elgato/streamdeck';

const KOFI_URL = 'https://ko-fi.com/K3K6RR4LY';

/** Static action: opens the author's ko-fi page in the default browser. */
@action({ UUID: 'com.4xsdev.axis-gateway.coffee' })
export class CoffeeAction extends SingletonAction {
    override async onKeyDown(_ev: KeyDownEvent<JsonObject>): Promise<void> {
        await streamDeck.system.openUrl(KOFI_URL);
    }
}
