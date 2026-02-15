import { describe, it } from 'node:test';
import assert from 'node:assert';

// Simple unit tests for profile command handler
describe('profile command', () => {
  it('should export handleProfileCommand', async () => {
    const { handleProfileCommand } = await import('../../../src/commands/profile.mjs');
    assert.strictEqual(typeof handleProfileCommand, 'function');
  });
});
