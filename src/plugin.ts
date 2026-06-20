import streamDeck, { LogLevel } from '@elgato/streamdeck';
import { PresetAction } from './actions/preset';
import { StreamAction } from './actions/stream';
import { OverlayAction } from './actions/overlay';
import { ViewAction } from './actions/view';

streamDeck.logger.setLevel(LogLevel.INFO);

streamDeck.actions.registerAction(new PresetAction());
streamDeck.actions.registerAction(new StreamAction());
streamDeck.actions.registerAction(new OverlayAction());
streamDeck.actions.registerAction(new ViewAction());

// Connect LAST, after all actions are registered.
streamDeck.connect();
