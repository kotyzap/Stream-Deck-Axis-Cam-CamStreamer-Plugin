/**
 * Shared PTZ radio state across the PTZ Preset and AXIS Guarded Tour actions.
 *
 * A camera's PTZ can only do one thing at a time per view area (channel): sit at a
 * preset OR run a guard tour. So presets, Home and guard tours all share ONE radio
 * group, keyed by camera IP + PTZ channel.
 *
 * Presets have no camera readback (the device doesn't report "I'm at preset X"), so
 * their highlight is tracked optimistically in memory here. Guard tours DO report a
 * real Running flag, so their key state is read from the camera — this module only
 * needs to remember which preset (if any) "won" the slot, and to let the two action
 * types repaint each other when the active item changes.
 *
 * In-memory state resets on plugin restart.
 */

/** camera IP for the radio scope ('' = shared global credentials). */
export const cameraKey = (s: { cameraIp?: string }): string => String(s.cameraIp ?? '');
/** View area within a camera (PTZ channel; '' when the device is single-channel). */
export const channelKey = (sel: { camera?: string } | null): string => String(sel?.camera ?? '');
/** Radio group: one active PTZ action per camera + view area. */
export const groupKey = (s: { cameraIp?: string }, sel: { camera?: string } | null): string =>
    `${cameraKey(s)}::${channelKey(sel)}`;

// groupKey -> the active preset's `sel` JSON string. Absent when a tour holds the
// slot (or nothing has been pressed yet).
const activePreset = new Map<string, string>();

export const getActivePreset = (gk: string): string | undefined => activePreset.get(gk);
export const setActivePreset = (gk: string, sel: string): void => void activePreset.set(gk, sel);
export const clearActivePreset = (gk: string): void => void activePreset.delete(gk);

// Cross-action repaint: each action registers a callback that repaints its own
// visible keys belonging to a group. Firing a group repaints both action types.
type RepaintFn = (gk: string) => void | Promise<void>;
const repaints = new Set<RepaintFn>();

export function registerRepaint(fn: RepaintFn): void {
    repaints.add(fn);
}

export async function fireRepaint(gk: string): Promise<void> {
    for (const fn of repaints) {
        try {
            await fn(gk);
        } catch {
            /* a key may have disappeared mid-repaint */
        }
    }
}
