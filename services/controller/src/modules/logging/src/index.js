"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEBUG_LOG_FILE = void 0;
exports.logDebug = logDebug;
exports.resolveLogFile = resolveLogFile;
exports.streamLog = streamLog;
exports.flushLog = flushLog;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const HOME_LOG_ROOT = node_path_1.default.join(node_os_1.default.homedir(), '.webauto', 'logs');
exports.DEBUG_LOG_FILE = node_path_1.default.join(HOME_LOG_ROOT, 'debug.jsonl');
const DEFAULT_SOURCES = {
    browser: node_path_1.default.join(HOME_LOG_ROOT, 'browser.log'),
    service: node_path_1.default.join(HOME_LOG_ROOT, 'service.log'),
    orchestrator: node_path_1.default.join(HOME_LOG_ROOT, 'orchestrator.log'),
};
let debugReady = false;
function isDebugEnabled() {
    return process.env.DEBUG === '1' || process.env.debug === '1';
}
function ensureDebugLogDir() {
    if (debugReady)
        return;
    try {
        node_fs_1.default.mkdirSync(node_path_1.default.dirname(exports.DEBUG_LOG_FILE), { recursive: true });
        debugReady = true;
    }
    catch {
        // ignore
    }
}
function logDebug(module, event, data = {}) {
    if (!isDebugEnabled())
        return;
    ensureDebugLogDir();
    const entry = {
        ts: Date.now(),
        level: 'debug',
        module,
        event,
        data,
    };
    try {
        node_fs_1.default.appendFileSync(exports.DEBUG_LOG_FILE, `${JSON.stringify(entry)}\n`);
    }
    catch {
        // ignore
    }
}
function resolveLogFile(options) {
    if (options.file) {
        return node_path_1.default.resolve(options.file);
    }
    if (options.session) {
        return node_path_1.default.join(HOME_LOG_ROOT, `session-${options.session}.log`);
    }
    if (options.source && DEFAULT_SOURCES[options.source]) {
        return DEFAULT_SOURCES[options.source];
    }
    return DEFAULT_SOURCES.browser;
}
async function streamLog(options = {}) {
    const file = resolveLogFile(options);
    const maxLines = options.maxLines ?? 200;
    const lines = await readTailLines(file, maxLines);
    return { file, lines };
}
async function flushLog(options = {}, truncate = false) {
    const file = resolveLogFile(options);
    const lines = await readTailLines(file, Number.MAX_SAFE_INTEGER);
    if (truncate) {
        await node_fs_1.default.promises
            .truncate(file, 0)
            .catch(() => Promise.resolve());
    }
    return { file, lines };
}
async function readTailLines(file, maxLines) {
    try {
        const content = await node_fs_1.default.promises.readFile(file, 'utf-8');
        const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
        if (lines.length <= maxLines) {
            return lines;
        }
        return lines.slice(-maxLines);
    }
    catch (err) {
        if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
            return [];
        }
        throw err;
    }
}
