// Test stub for @elgato/streamdeck — harness always passes an explicit conn,
// so getGlobalSettings is never the source of truth here.
const streamDeck = {
    settings: { getGlobalSettings: async () => ({}) },
    logger: { createScope: () => ({ info() { }, error() { }, debug() { }, warn() { }, trace() { } }) },
};
export default streamDeck;
