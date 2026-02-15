import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  camoStart, 
  camoStop,
  camoGoto,
  camoClick,
  camoType,
  camoPress,
  camoScroll,
  camoContainerFilter,
  camoWaitForElement,
} from '../camo-commands.js';

describe('camo-commands', () => {
  describe('module exports', () => {
    it('should export all required functions', () => {
      assert.strictEqual(typeof camoStart, 'function');
      assert.strictEqual(typeof camoStop, 'function');
      assert.strictEqual(typeof camoGoto, 'function');
      assert.strictEqual(typeof camoClick, 'function');
      assert.strictEqual(typeof camoType, 'function');
      assert.strictEqual(typeof camoPress, 'function');
      assert.strictEqual(typeof camoScroll, 'function');
      assert.strictEqual(typeof camoContainerFilter, 'function');
      assert.strictEqual(typeof camoWaitForElement, 'function');
    });
  });

  describe('camoStart/camoStop', () => {
    it('should have correct function signatures', () => {
      // camoStart(profileId, url?, headless?) -> Promise<CamoSession>
      assert.strictEqual(camoStart.length, 3);
      // camoStop(profileId) -> Promise<void>
      assert.strictEqual(camoStop.length, 1);
    });
  });

  describe('camoGoto', () => {
    it('should have correct function signature', () => {
      assert.strictEqual(camoGoto.length, 2);
    });
  });

  describe('camoClick/camoType/camoPress', () => {
    it('should have correct function signatures', () => {
      assert.strictEqual(camoClick.length, 2);
      assert.strictEqual(camoType.length, 3);
      assert.strictEqual(camoPress.length, 2);
    });
  });

  describe('camoScroll', () => {
    it('should have correct function signature with defaults', () => {
      // default params are not counted in Function.length
      assert.strictEqual(camoScroll.length, 1);
    });
  });

  describe('camoContainerFilter', () => {
    it('should have correct function signature', () => {
      assert.strictEqual(camoContainerFilter.length, 2);
    });
  });

  describe('camoWaitForElement', () => {
    it('should have correct function signature with optional params', () => {
      // default params are not counted in Function.length
      assert.strictEqual(camoWaitForElement.length, 2);
    });
  });
});
