import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  XHS_CHECKPOINT_SELECTORS,
  getPrimarySelector,
  getAllSelectors,
  getCheckpointConfig,
  getCheckpointsByPriority,
  isBlockingCheckpoint,
  isValidTransition,
  BLOCKING_CHECKPOINTS,
} from '../checkpoint-selectors.js';

describe('checkpoint-selectors', () => {
  describe('XHS_CHECKPOINT_SELECTORS', () => {
    it('should have all expected checkpoints', () => {
      const checkpoints = XHS_CHECKPOINT_SELECTORS.map(c => c.checkpoint);
      assert.ok(checkpoints.includes('home_ready'));
      assert.ok(checkpoints.includes('search_ready'));
      assert.ok(checkpoints.includes('detail_ready'));
      assert.ok(checkpoints.includes('comments_ready'));
      assert.ok(checkpoints.includes('login_guard'));
      assert.ok(checkpoints.includes('risk_control'));
    });

    it('should have selectors for each checkpoint', () => {
      for (const config of XHS_CHECKPOINT_SELECTORS) {
        assert.ok(config.selectors.length > 0, `${config.checkpoint} should have selectors`);
        assert.ok(config.selectors[0], `${config.checkpoint} first selector should be truthy`);
      }
    });

    it('should have valid priorities', () => {
      for (const config of XHS_CHECKPOINT_SELECTORS) {
        assert.strictEqual(typeof config.priority, 'number');
        assert.ok(config.priority >= 0);
      }
    });
  });

  describe('getPrimarySelector', () => {
    it('should return first selector for home_ready', () => {
      const selector = getPrimarySelector('home_ready');
      assert.strictEqual(selector, '#search-input');
    });

    it('should return first selector for search_ready', () => {
      const selector = getPrimarySelector('search_ready');
      assert.strictEqual(selector, '.feeds-container');
    });

    it('should return null for unknown checkpoint', () => {
      const selector = getPrimarySelector('unknown_checkpoint');
      assert.strictEqual(selector, null);
    });
  });

  describe('getAllSelectors', () => {
    it('should return all selectors for checkpoint', () => {
      const selectors = getAllSelectors('home_ready');
      assert.ok(selectors.length > 0);
      assert.ok(selectors.includes('#search-input'));
    });

    it('should return empty array for unknown checkpoint', () => {
      const selectors = getAllSelectors('unknown_checkpoint');
      assert.deepStrictEqual(selectors, []);
    });
  });

  describe('getCheckpointConfig', () => {
    it('should return config for valid checkpoint', () => {
      const config = getCheckpointConfig('detail_ready');
      assert.ok(config);
      assert.strictEqual(config.checkpoint, 'detail_ready');
      assert.ok(config.selectors.length > 0);
    });

    it('should return undefined for unknown checkpoint', () => {
      const config = getCheckpointConfig('unknown_checkpoint');
      assert.strictEqual(config, undefined);
    });
  });

  describe('getCheckpointsByPriority', () => {
    it('should return checkpoints sorted by priority', () => {
      const sorted = getCheckpointsByPriority();
      assert.strictEqual(sorted[0].priority, 0);
    });
  });

  describe('isBlockingCheckpoint', () => {
    it('should return true for blocking checkpoints', () => {
      assert.strictEqual(isBlockingCheckpoint('login_guard'), true);
      assert.strictEqual(isBlockingCheckpoint('risk_control'), true);
      assert.strictEqual(isBlockingCheckpoint('offsite'), true);
    });

    it('should return false for normal checkpoints', () => {
      assert.strictEqual(isBlockingCheckpoint('home_ready'), false);
      assert.strictEqual(isBlockingCheckpoint('search_ready'), false);
      assert.strictEqual(isBlockingCheckpoint('detail_ready'), false);
    });
  });

  describe('isValidTransition', () => {
    it('should allow same checkpoint transition', () => {
      assert.strictEqual(isValidTransition('home_ready', 'home_ready'), true);
    });

    it('should allow valid transitions', () => {
      assert.strictEqual(isValidTransition('home_ready', 'search_ready'), true);
      assert.strictEqual(isValidTransition('search_ready', 'detail_ready'), true);
    });

    it('should not allow offsite transitions', () => {
      assert.strictEqual(isValidTransition('offsite', 'home_ready'), false);
    });
  });

  describe('BLOCKING_CHECKPOINTS', () => {
    it('should contain expected blocking checkpoints', () => {
      assert.ok(BLOCKING_CHECKPOINTS.includes('login_guard'));
      assert.ok(BLOCKING_CHECKPOINTS.includes('risk_control'));
      assert.ok(BLOCKING_CHECKPOINTS.includes('offsite'));
    });
  });
});
