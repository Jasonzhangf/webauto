/**
 * Auto-Scroll Strategy - 自动滚动策略
 */

export interface AutoScrollConfig {
  trigger: {
    type: 'immediate' | 'on-boundary' | 'on-condition';
    boundaryThreshold?: number;
    condition?: () => boolean;
  };
  scrollDistance?: number;
  waitAfterScroll?: number;
  maxScrolls?: number;
  stopOnNoChange?: boolean;
  noChangeRetries?: number;
  stopCondition?: () => boolean;
}

export interface ScrollState {
  scrollCount: number;
  lastViewportHeight: number;
  noChangeCount: number;
  isScrolling: boolean;
  hasReachedBottom: boolean;
}

export class AutoScrollStrategy {
  private config: Required<AutoScrollConfig>;
  private state: ScrollState;
  private executeScroll: (distance: number) => Promise<void>;
  private getViewportHeight: () => Promise<number>;
  private wait: (ms: number) => Promise<void>;
  
  constructor(
    executeScroll: (distance: number) => Promise<void>,
    getViewportHeight: () => Promise<number>,
    wait: (ms: number) => Promise<void>,
    config: AutoScrollConfig
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
  
  shouldStartScrolling(context: {
    discoveredContainers: number;
    visibleContainers: number;
  }): boolean {
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
  
  private shouldStopScrolling(): boolean {
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
  
  private async performScroll(): Promise<boolean> {
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
  
  async execute(): Promise<ScrollState> {
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
  
  reset(): void {
    this.state = {
      scrollCount: 0,
      lastViewportHeight: 0,
      noChangeCount: 0,
      isScrolling: false,
      hasReachedBottom: false
    };
  }
  
  getState(): Readonly<ScrollState> {
    return { ...this.state };
  }
}
