declare module '../../modules/logging/src/debug.js' {
  export function logDebug(module: string, event: string, data?: Record<string, any>): void;
  export const DEBUG_LOG_FILE: string;
}
