import { IBrowserOperation } from '../interfaces/IBrowserOperation';

export class BrowserOperationRegistry {
  private operations: Map<string, IBrowserOperation> = new Map();

  registerOperation(operation: IBrowserOperation): void {
    this.operations.set(operation.name, operation);
  }

  getOperation(name: string): IBrowserOperation | undefined {
    return this.operations.get(name);
  }

  getOperationsByCategory(category: string): IBrowserOperation[] {
    return Array.from(this.operations.values())
      .filter(op => op.abstractCategories?.includes(category));
  }

  listOperations(): string[] {
    return Array.from(this.operations.keys());
  }

  unregisterOperation(name: string): boolean {
    return this.operations.delete(name);
  }

  clear(): void {
    this.operations.clear();
  }

  get size(): number {
    return this.operations.size;
  }
}