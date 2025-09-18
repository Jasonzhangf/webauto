import { vi } from 'vitest';

// Mock fs module
const mockFs = {
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '[]'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
};
vi.mock('fs', () => mockFs);

// Export mockFs for test manipulation
export { mockFs };

// Mock path module
vi.mock('path', () => ({
  dirname: vi.fn((path) => path.split('/').slice(0, -1).join('/')),
  join: vi.fn((...paths) => paths.join('/')),
}));

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};