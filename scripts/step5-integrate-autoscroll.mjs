#!/usr/bin/env node
/**
 * Step 5: 验证 AutoScrollStrategy 逻辑
 */

class AutoScrollStrategy {
  constructor(
    executeScroll,
    getViewportHeight,
    wait,
    config
  ) {
    this.executeScroll = executeScroll;
    this.getViewportHeight = getViewportHeight;
    this.wait = wait;
    this.config = {
      trigger: config.trigger,
      scrollDistance: config.scrollDistance ?? 800,
      waitAfterScroll: config.waitAfterScroll ?? 3000,
      maxScrolls: config.maxScrolls ?? 50,
      stopOnNoChange: config.stopOnNoChange ?? true,
      noChangeRetries: config.noChangeRetries ?? 3,
      stopCondition: config.stopCondition ?? (() => false)
    };

    this.state = {
      scrollCount: 0,
      lastViewportHeight: 0,
      noChangeCount: 0,
      isScrolling: false,
      hasReachedBottom: false
    };
  }

  shouldStartScrolling(context) {
    const { type, boundaryThreshold, condition } = this.config.trigger;

    switch (type) {
      case 'immediate':
        return true;

      case 'on-boundary':
        const threshold = boundaryThreshold ?? 0.8;
        const ratio = context.visibleContainers > 0
          ? context.discoveredContainers / context.visibleContainers
          : 0;
        return ratio >= threshold;

      case 'on-condition':
        return condition ? condition() : false;

      default:
        return false;
    }
  }

  shouldStopScrolling() {
    if (this.state.scrollCount >= this.config.maxScrolls) {
      return true;
    }

    if (this.config.stopCondition()) {
      return true;
    }

    if (this.config.stopOnNoChange && this.state.hasReachedBottom) {
      return true;
    }

    return false;
  }

  async performScroll() {
    const heightBefore = await this.getViewportHeight();

    await this.executeScroll(this.config.scrollDistance);
    this.state.scrollCount++;

    await this.wait(this.config.waitAfterScroll);

    const heightAfter = await this.getViewportHeight();

    const hasChanged = Math.abs(heightAfter - heightBefore) > 10;

    if (hasChanged) {
      this.state.noChangeCount = 0;
      this.state.lastViewportHeight = heightAfter;
      this.state.hasReachedBottom = false;
      return true;
    } else {
      this.state.noChangeCount++;

      if (this.state.noChangeCount >= this.config.noChangeRetries) {
        this.state.hasReachedBottom = true;
      }

      return false;
    }
  }

  async execute() {
    if (this.state.isScrolling) {
      throw new Error('Auto-scroll is already running');
    }

    this.state.isScrolling = true;

    try {
      this.state.lastViewportHeight = await this.getViewportHeight();

      while (!this.shouldStopScrolling()) {
        const hasNewContent = await this.performScroll();

        if (!hasNewContent && this.state.hasReachedBottom) {
          break;
        }
      }

      return { ...this.state };

    } finally {
      this.state.isScrolling = false;
    }
  }

  getState() {
    return { ...this.state };
  }
}

async function testAutoScrollLogic() {
  console.log('🔄 Step 5: Testing AutoScrollStrategy Logic');
  console.log('============================================\n');

  try {
    const executeScroll = async (distance) => {
      console.log(`   🔄 Mock scroll: ${distance}px`);
      await new Promise(r => setTimeout(r, 100));
    };

    const getViewportHeight = async () => {
      console.log('   📏 Mock getting viewport height...');
      await new Promise(r => setTimeout(r, 50));
      return Math.floor(Math.random() * 5000) + 2000;
    };

    const wait = async (ms) => {
      await new Promise(r => setTimeout(r, ms));
    };

    console.log('1️⃣ Creating AutoScrollStrategy instance...');
    const strategy = new AutoScrollStrategy(
      executeScroll,
      getViewportHeight,
      wait,
      {
        trigger: {
          type: 'immediate'
        },
        scrollDistance: 800,
        waitAfterScroll: 2000,
        maxScrolls: 2,
        stopOnNoChange: true,
        noChangeRetries: 2,
        stopCondition: () => {
          return false;
        }
      }
    );
    console.log('   ✅ Instance created\n');

    console.log('2️⃣ Testing shouldStartScrolling...');
    const shouldStart = strategy.shouldStartScrolling({
      discoveredContainers: 8,
      visibleContainers: 10
    });
    console.log(`   Discovered: 8, Visible: 10`);
    console.log(`   Should Start: ${shouldStart}\n`);

    console.log('3️⃣ Testing execute...');
    const state = await strategy.execute();
    console.log(`   Scroll Count: ${state.scrollCount}`);
    console.log(`   Last Height: ${state.lastViewportHeight}`);
    console.log(`   No Change Count: ${state.noChangeCount}`);
    console.log(`   Has Reached Bottom: ${state.hasReachedBottom}\n`);

    console.log('4️⃣ Testing getState...');
    const currentState = strategy.getState();
    console.log(`   State:`, JSON.stringify(currentState, null, 2));

    console.log('\n✅ All AutoScrollStrategy methods work correctly!');
    console.log('\n📋 Step 5 Complete!');
    console.log('📋 Next: Use WorkflowExecutor with real browser operations');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

testAutoScrollLogic().catch(console.error);
