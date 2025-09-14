// Base Container - Container base class inheriting from RCC BaseModule
import { BaseModule } from '../utils/rcc-basemodule';
import { SystemStateCenter } from '../core/system-state-center';
import { 
  IEntityRegistration, 
  IEntityState, 
  IExecutionContext, 
  IOperation, 
  ContainerNode 
} from '../interfaces/core';

export abstract class BaseContainer extends BaseModule {
  protected stateCenter: SystemStateCenter;
  protected containerId: string;
  
  // Public getter for containerId
  public get ContainerId(): string {
    return this.containerId;
  }
  protected children: Map<string, BaseContainer> = new Map();
  protected operations: Map<string, IOperation> = new Map();
  protected page: any; // Page object
  
  // Add public properties for BaseModule compatibility
  public id: string;
  public name: string;
  public version: string;
  public type: string;
  
  constructor(config: any) {
    super({
      id: config.id,
      name: config.name,
      version: '1.0.0',
      type: 'container',
      ...config
    });
    
    this.id = config.id;
    this.name = config.name;
    this.version = '1.0.0';
    this.type = 'container';
    this.containerId = this.id;
    this.stateCenter = SystemStateCenter.getInstance();
    this.page = config.page || null;
  }
  
  async initialize(): Promise<void> {
    await super.initialize();
    
    this.logInfo(`Initializing container: ${this.name}`);
    
    // Register to state center
    await this.registerToStateCenter();
    
    // Initialize child containers
    await this.initializeChildren();
    
    // Register operations
    await this.registerOperations();
    
    // Perform internal traversal to discover sub-containers
    await this.performInternalTraversal();
    
    // Container-specific initialization logic
    await this.doInitialize();
    
    this.logInfo(`${this.name} initialized and registered to state center`);
  }
  
  protected abstract registerToStateCenter(): Promise<void>;
  protected abstract initializeChildren(): Promise<void>;
  protected abstract registerOperations(): Promise<void>;
  
  // Subclass can override initialization method
  protected async doInitialize(): Promise<void> {
    // Default implementation is empty, subclasses can override
  }
  
  // Internal traversal to discover sub-containers within list elements
  protected async performInternalTraversal(): Promise<void> {
    if (!this.page) {
      this.logInfo('No page object available for internal traversal');
      return;
    }
    
    try {
      this.logInfo(`Starting internal traversal for container: ${this.name}`);
      
      // Get the container's root element
      const rootSelector = this.getRootSelector();
      if (!rootSelector) {
        this.logInfo('No root selector defined, skipping internal traversal');
        return;
      }
      
      // Find all list elements within this container
      const listElements = await this.findListElements(rootSelector);
      
      // For each list element, check if it matches known container patterns
      for (const listElement of listElements) {
        await this.discoverSubContainers(listElement);
      }
      
      this.logInfo(`Internal traversal completed, found ${this.children.size} sub-containers`);
      
    } catch (error) {
      this.error('Internal traversal failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }
  
  // Get the root selector for this container (to be implemented by subclasses)
  protected abstract getRootSelector(): string | null;
  
  // Find list elements within the container
  protected async findListElements(rootSelector: string): Promise<any[]> {
    try {
      // Common patterns for list elements in Weibo
      const listPatterns = [
        `${rootSelector} [class*="list"]`,
        `${rootSelector} [class*="feed"]`,
        `${rootSelector} [class*="card"]`,
        `${rootSelector} [class*="item"]`,
        `${rootSelector} [class*="content"]`,
        `${rootSelector} > div`,
        `${rootSelector} > *`
      ];
      
      const elements: any[] = [];
      
      for (const pattern of listPatterns) {
        try {
          const foundElements = await this.page.$$(pattern);
          if (foundElements.length > 0) {
            elements.push(...foundElements);
            this.logInfo(`Found ${foundElements.length} elements with pattern: ${pattern}`);
          }
        } catch (error) {
          // Continue to next pattern if this one fails
          continue;
        }
      }
      
      // Remove duplicates
      const uniqueElements = Array.from(new Set(elements));
      this.logInfo(`Total unique list elements found: ${uniqueElements.length}`);
      
      return uniqueElements;
      
    } catch (error) {
      this.error('Failed to find list elements', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }
  
  // Discover sub-containers within a list element
  protected async discoverSubContainers(listElement: any): Promise<void> {
    try {
      // Check if this element matches known container patterns
      const containerType = await this.identifyContainerType(listElement);
      
      if (containerType) {
        // Create a sub-container for this element
        const subContainer = await this.createSubContainer(listElement, containerType);
        
        if (subContainer) {
          this.addChild(subContainer);
          this.logInfo(`Created sub-container: ${subContainer.name} of type ${containerType}`);
        }
      }
      
    } catch (error) {
      this.error('Failed to discover sub-containers', { error: error instanceof Error ? error.message : String(error) });
    }
  }
  
  // Identify the type of container based on element attributes and content
  protected async identifyContainerType(element: any): Promise<string | null> {
    try {
      // Get element attributes
      const attributes = await element.evaluate((el: any) => {
        const attrs: any = {};
        for (const { name, value } of el.attributes) {
          attrs[name] = value;
        }
        return attrs;
      });
      
      // Get element text content
      const textContent = await element.textContent();
      
      // Check for Weibo-specific patterns
      const patterns = {
        'user-profile': {
          attributes: ['class', 'data-user-id'],
          textPatterns: ['关注', '粉丝', '微博']
        },
        'post-content': {
          attributes: ['class', 'data-mid'],
          textPatterns: ['转发', '评论', '赞']
        },
        'comment-list': {
          attributes: ['class', 'data-comment-id'],
          textPatterns: ['评论', '回复']
        },
        'navigation': {
          attributes: ['class', 'role'],
          textPatterns: ['首页', '发现', '消息']
        }
      };
      
      // Check each pattern
      for (const [type, pattern] of Object.entries(patterns)) {
        let matchScore = 0;
        
        // Check attributes
        for (const attr of pattern.attributes) {
          if (attributes[attr]) {
            matchScore++;
          }
        }
        
        // Check text patterns
        for (const textPattern of pattern.textPatterns) {
          if (textContent.includes(textPattern)) {
            matchScore++;
          }
        }
        
        // If we have a good match, return this type
        if (matchScore >= 2) {
          return type;
        }
      }
      
      return null;
      
    } catch (error) {
      this.error('Failed to identify container type', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }
  
  // Create a sub-container (to be implemented by subclasses)
  protected abstract createSubContainer(element: any, containerType: string): Promise<BaseContainer | null>;
  
  // Operation execution
  async executeOperation(operationName: string, params: any = {}): Promise<any> {
    const operation = this.operations.get(operationName);
    if (!operation) {
      throw new Error(`Operation not found: ${operationName}`);
    }
    
    const context = this.createExecutionContext();
    const result = await operation.execute(context, params);
    
    // Update state center
    await this.updateOperationState(operationName, params, result);
    
    return result;
  }
  
  // Batch execute operations
  async executeOperations(operationList: Array<{name: string, params: any}>): Promise<any[]> {
    const results: any[] = [];
    
    for (const { name, params } of operationList) {
      try {
        const result = await this.executeOperation(name, params);
        results.push({ name, result, success: true });
      } catch (error) {
        this.error(`Operation failed: ${name}`, { error: error instanceof Error ? error.message : String(error) });
        results.push({ name, error: error instanceof Error ? error.message : String(error), success: false });
      }
    }
    
    return results;
  }
  
  // Add child container
  protected addChild(child: BaseContainer): void {
    this.children.set(child.id, child);
    this.logInfo(`Added child container: ${child.id}`);
  }
  
  // Register operation
  protected registerOperation(name: string, operation: IOperation): void {
    this.operations.set(name, operation);
    this.logInfo(`Registered operation: ${name}`);
  }
  
  // Get container summary
  getContainerSummary(): any {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      children: Array.from(this.children.keys()),
      operations: Array.from(this.operations.keys()),
      timestamp: Date.now()
    };
  }
  
  // Health check
  async healthCheck(): Promise<any> {
    const state = this.stateCenter.getEntityState(this.containerId);
    
    return {
      containerId: this.containerId,
      healthy: state?.status === 'active',
      childrenCount: this.children.size,
      operationsCount: this.operations.size,
      lastStateUpdate: state?.timestamp,
      timestamp: Date.now()
    };
  }
  
  private createExecutionContext(): IExecutionContext {
    return {
      container: this,
      stateCenter: this.stateCenter,
      page: this.page,
      timestamp: Date.now()
    };
  }
  
  private async updateOperationState(operationName: string, params: any, result: any): Promise<void> {
    const currentState = this.stateCenter.getEntityState(this.containerId);
    if (!currentState) return;
    
    const operationCount = Number(currentState.metrics.get('operationCount') || 0) + 1;
    
    // Create new metrics Map with proper type consistency
    const newMetrics = new Map<string, number | string>(currentState.metrics || []);
    newMetrics.set('operationCount', operationCount);
    newMetrics.set('lastOperation', operationName);
    newMetrics.set('lastOperationTime', Date.now());
    
    await this.stateCenter.updateEntityState(this.containerId, {
      metrics: newMetrics
    });
  }
}