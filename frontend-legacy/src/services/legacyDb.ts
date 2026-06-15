/** Placeholders hasta migrar datos al backend FastAPI (sin Firebase). */
export type LegacyDbClient = Record<string, never>;
export type LegacyStorageClient = Record<string, never>;

export const legacyDb: LegacyDbClient = {};
export const legacyStorage: LegacyStorageClient = {};
