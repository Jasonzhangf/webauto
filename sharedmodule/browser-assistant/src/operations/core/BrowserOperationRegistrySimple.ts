import { IBrowserOperation } from '../interfaces/IBrowserOperation';
import { BrowserLaunchOperation } from '../browser/BrowserLaunchOperationSimple';

export class BrowserOperationRegistry {
  private operations: Map<string, IBrowserOperation> = new Map();

  constructor() {
    this.registerDefaultOperations();
  }

  private registerDefaultOperations(): void {
    this.registerOperation(new BrowserLaunchOperation());
  }

  registerOperation(operation: IBrowserOperation): void {
    this.operations.set(operation.name, operation);
  }

  getOperation(name: string): IBrowserOperation | undefined {
    return this.operations.get(name);
  }

  listOperations(): string[] {
    return Array.from(this.operations.keys());
  }

  get size(): number {
    return this.operations.size;
  }

  hasOperation(name: string): boolean {
    return this.operations.has(name);
  }

  removeOperation(name: string): boolean {
    return this.operations.delete(name);
  }

  clear(): void {
    this.operations.clear();
  }

  getOperationsByCategory(category: string): IBrowserOperation[] {
    return Array.from(this.operations.values()).filter(
      op => op.abstractCategories?.includes(category)
    );
  }

  getOperationsByCapability(capability: string): IBrowserOperation[] {
    return Array.from(this.operations.values()).filter(
      op => op.capabilities?.includes(capability)
    );
  }

  unregisterOperation(name: string): boolean {
    return this.operations.delete(name);
  }
}