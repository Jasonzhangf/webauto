import type { ContainerDefinition } from '../../container-registry/src/index.js';
import { getOperation } from './registry.js';
import type { OperationDefinition } from './registry.js';

export interface ContainerOperationIssue {
  containerId: string;
  operationId: string;
  reason: string;
  level: 'error' | 'warning';
}

function hasCapability(container: ContainerDefinition, required?: string[]): boolean {
  if (!required || !required.length) {
    return true;
  }
  const capabilitySet = new Set((container.capabilities || []).map((c: string) => c.toLowerCase()));
  return required.every((cap) => capabilitySet.has(cap.toLowerCase()));
}

function isOperationListed(container: ContainerDefinition, operationId: string): boolean {
  const declared = container.operations || [];
  return declared.some((item: any) => (item?.type || item?.id) === operationId);
}

export function validateContainerOperations(container: ContainerDefinition): ContainerOperationIssue[] {
  const issues: ContainerOperationIssue[] = [];
  const operations = container.operations || [];
  if (!operations.length) {
    return issues;
  }
  for (const entry of operations) {
    const operationId = entry?.type || entry?.id;
    if (!operationId) {
      issues.push({
        containerId: container.id,
        operationId: 'unknown',
        level: 'error',
        reason: 'operation entry missing type/id',
      });
      continue;
    }
    const operation: OperationDefinition | undefined = getOperation(operationId);
    if (!operation) {
      issues.push({
        containerId: container.id,
        operationId,
        level: 'error',
        reason: 'operation is not registered in OperationRegistry',
      });
      continue;
    }
    const required = operation.requiredCapabilities;
    if (!hasCapability(container, required)) {
      issues.push({
        containerId: container.id,
        operationId,
        level: 'error',
        reason: `missing capabilities: ${required?.join(', ') || ''}`,
      });
    }
  }
  return issues;
}

export function assertContainerOperations(container: ContainerDefinition) {
  const issues = validateContainerOperations(container);
  if (issues.length) {
    const summary = issues
      .map((issue) => `${issue.containerId}:${issue.operationId} -> ${issue.reason}`)
      .join('\n');
    const error = new Error(`Container operation validation failed:\n${summary}`);
    (error as any).issues = issues;
    throw error;
  }
}

export function containerAllowsOperation(container: ContainerDefinition, operationId: string) {
  const operation = getOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown operation: ${operationId}`);
  }
  if (!hasCapability(container, operation.requiredCapabilities)) {
    throw new Error(
      `Operation ${operationId} requires capabilities ${operation.requiredCapabilities?.join(', ') || ''}`,
    );
  }
  if (container.operations && container.operations.length && !isOperationListed(container, operationId)) {
    throw new Error(`Operation ${operationId} is not declared in container ${container.id}`);
  }
}
