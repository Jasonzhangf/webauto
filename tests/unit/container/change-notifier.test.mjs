@@ -0,0 +1,184 @@
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { ChangeNotifier, getChangeNotifier, destroyChangeNotifier } from '../../../src/container/change-notifier.mjs';

describe('ChangeNotifier', () => {
  let notifier;

  beforeEach(() => {
    notifier = new ChangeNotifier();
  });

  afterEach(() => {
    notifier.destroy();
  });

  describe('subscribe', () => {
    it('should subscribe to a topic', () => {
      let called = false;
      notifier.subscribe('test-topic', () => { called = true; });
      notifier.notify('test-topic', { data: 'test' });
      assert.strictEqual(called, true);
    });

    it('should return unsubscribe function', () => {
      let callCount = 0;
      const unsub = notifier.subscribe('test-topic', () => { callCount++; });
      notifier.notify('test-topic', {});
      assert.strictEqual(callCount, 1);
      unsub();
      notifier.notify('test-topic', {});
      assert.strictEqual(callCount, 1);
    });

    it('should support multiple subscribers', () => {
      const results = [];
      notifier.subscribe('topic', () => results.push(1));
      notifier.subscribe('topic', () => results.push(2));
      notifier.notify('topic', {});
      assert.deepStrictEqual(results.sort(), [1, 2]);
    });

    it('should not throw on non-existent topic', () => {
      assert.doesNotThrow(() => notifier.notify('no-topic', {}));
    });
  });

  describe('watch', () => {
    it('should register element watcher', () => {
      let appeared = false;
      notifier.watch('.my-selector', { onAppear: () => { appeared = true; } });
      assert.strictEqual(notifier.elementWatchers.has('.my-selector'), true);
    });

    it('should return unsubscribe function', () => {
      const unsub = notifier.watch('.selector', {});
      unsub();
      assert.strictEqual(notifier.elementWatchers.has('.selector'), false);
    });
  });

  describe('processSnapshot', () => {
    it('should notify dom:changed topic', () => {
      let received = null;
      notifier.subscribe('dom:changed', (data) => { received = data; });
      const snapshot = { root: {} };
      notifier.processSnapshot(snapshot);
      assert.strictEqual(received.snapshot, snapshot);
    });

    it('should trigger onAppear for new elements', () => {
      const appeared = [];
      notifier.watch('.item', { onAppear: (els) => appeared.push(...els), throttle: 0 });

      const snapshot = {
        selector: '.item',
        children: [
          { selector: '.item', path: 'root/0' },
        ]
      };
      notifier.processSnapshot(snapshot);

      // Process again to detect change from null state
      const snapshot2 = {
        selector: '.item',
        children: [
          { selector: '.item', path: 'root/0' },
          { selector: '.item', path: 'root/1' },
        ]
      };
      notifier.processSnapshot(snapshot2);

      assert.ok(appeared.length >= 1);
    });

    it('should trigger onDisappear for removed elements', () => {
      const disappeared = [];
      notifier.watch('.item', {
        onDisappear: (els) => disappeared.push(...els),
        throttle: 0
      });

      const snapshot1 = {
        children: [
          { selector: '.item', path: 'root/0' },
          { selector: '.item', path: 'root/1' },
        ]
      };
      notifier.processSnapshot(snapshot1);

      const snapshot2 = {
        children: [
          { selector: '.item', path: 'root/0' },
        ]
      };
      notifier.processSnapshot(snapshot2);

      assert.ok(disappeared.length >= 1);
    });
  });

  describe('findElements', () => {
    it('should find matching elements recursively', () => {
      const tree = {
        selector: '.root',
        children: [
          { selector: '.item' },
          { selector: '.other' },
          {
            selector: '.container',
            children: [
              { selector: '.item' },
            ]
          },
        ]
      };

      const results = notifier.findElements(tree, { css: '.item' });
      assert.strictEqual(results.length, 2);
    });
  });

  describe('nodeMatchesSelector', () => {
    it('should match by css selector', () => {
      const node = { selector: '.test-class' };
      assert.strictEqual(notifier.nodeMatchesSelector(node, { css: '.test-class' }), true);
    });

    it('should match by id', () => {
      const node = { id: 'my-id' };
      assert.strictEqual(notifier.nodeMatchesSelector(node, { id: 'my-id' }), true);
    });

    it('should match by classes', () => {
      const node = { classes: ['a', 'b'] };
      assert.strictEqual(notifier.nodeMatchesSelector(node, { classes: ['a', 'b'] }), true);
    });

    it('should return false for no match', () => {
      const node = { classes: ['x'] };
      assert.strictEqual(notifier.nodeMatchesSelector(node, { classes: ['y'] }), false);
    });
  });

  describe('global instance', () => {
    it('should return singleton', () => {
      const n1 = getChangeNotifier();
      const n2 = getChangeNotifier();
      assert.strictEqual(n1, n2);
      destroyChangeNotifier();
    });

    it('should destroy global instance', () => {
      const n = getChangeNotifier();
      destroyChangeNotifier();
      const n2 = getChangeNotifier();
      assert.notStrictEqual(n, n2);
      destroyChangeNotifier();
    });
  });
});
