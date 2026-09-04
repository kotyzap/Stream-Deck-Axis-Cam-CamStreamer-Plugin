import streamDeck, { action, SingletonAction } from '@elgato/streamdeck';

/** Ko-fi — GitHub build only (Marketplace forbids sponsor links inside plugins; package.sh --kofi lists it). */
@action({ UUID: 'com.4xsdev.axis-gateway.kofi' })
export class KofiAction extends SingletonAction {
    override onKeyDown(): void {
        streamDeck.system.openUrl('https://ko-fi.com/K3K6RR4LY');
    }
}
