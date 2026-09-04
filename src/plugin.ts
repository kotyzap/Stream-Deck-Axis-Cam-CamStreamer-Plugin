import streamDeck from '@elgato/streamdeck';
import { PresetAction } from './actions/preset';
import { GuardTourAction } from './actions/guardtour';
import { StreamAction } from './actions/stream';
import { OverlayAction } from './actions/overlay';
import { ViewAction } from './actions/view';
import { CamControlAction } from './actions/camcontrol';

streamDeck.logger.setLevel('info');

streamDeck.actions.registerAction(new PresetAction());
streamDeck.actions.registerAction(new GuardTourAction());
streamDeck.actions.registerAction(new StreamAction());
streamDeck.actions.registerAction(new OverlayAction());
streamDeck.actions.registerAction(new ViewAction());
streamDeck.actions.registerAction(new CamControlAction());

// Connect LAST, after all actions are registered.
streamDeck.connect();
