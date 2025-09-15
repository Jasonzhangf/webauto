/**
 * Main entry point for the Operations Framework
 * Exports all operations and provides convenience functions for registration
 */

// Core components - import first for internal use
import { globalRegistry } from './core/OperationRegistry.js';
import { BaseOperation } from './core/BaseOperation.js';
import { OperationRegistry } from './core/OperationRegistry.js';
import { ExecutionContext, ExecutionContextManager } from './execution/ExecutionContext.js';
import { NestedOrchestrator } from './execution/NestedOrchestrator.js';

// Then export for external use
export { BaseOperation, OperationRegistry, globalRegistry, ExecutionContext, ExecutionContextManager, NestedOrchestrator };

// Search Operations
import { 
  WeiboSearchOperation, 
  GenericSearchOperation, 
  GoogleSearchOperation 
} from './micro-operations/SearchOperations.js';

// Extraction Operations
import { 
  LinkExtractorOperation, 
  TextExtractorOperation, 
  ImageExtractorOperation, 
  ContentExtractorOperation 
} from './micro-operations/ExtractionOperations.js';

// Navigation Operations
import { 
  PageNavigationOperation, 
  ElementClickOperation, 
  FormFillOperation 
} from './micro-operations/NavigationOperations.js';

// Data Processing Operations
import { 
  DataMergerOperation, 
  DataFilterOperation, 
  DataTransformerOperation, 
  MarkdownConverterOperation 
} from './micro-operations/DataProcessingOperations.js';

// File Operations
import { 
  JsonFileSaverOperation, 
  MarkdownFileSaverOperation, 
  CsvFileSaverOperation 
} from './micro-operations/FileOperations.js';

// Export all operations
export { 
  WeiboSearchOperation, 
  GenericSearchOperation, 
  GoogleSearchOperation,
  LinkExtractorOperation, 
  TextExtractorOperation, 
  ImageExtractorOperation, 
  ContentExtractorOperation,
  PageNavigationOperation, 
  ElementClickOperation, 
  FormFillOperation,
  DataMergerOperation, 
  DataFilterOperation, 
  DataTransformerOperation, 
  MarkdownConverterOperation,
  JsonFileSaverOperation, 
  MarkdownFileSaverOperation, 
  CsvFileSaverOperation
};

/**
 * Register all operations with the global registry
 */
export function registerAllOperations(registry = globalRegistry) {
  console.log('Registering all operations with the framework...');
  
  // Search Operations
  registry.register(new WeiboSearchOperation());
  registry.register(new GenericSearchOperation());
  registry.register(new GoogleSearchOperation());
  
  // Extraction Operations
  registry.register(new LinkExtractorOperation());
  registry.register(new TextExtractorOperation());
  registry.register(new ImageExtractorOperation());
  registry.register(new ContentExtractorOperation());
  
  // Navigation Operations
  registry.register(new PageNavigationOperation());
  registry.register(new ElementClickOperation());
  registry.register(new FormFillOperation());
  
  // Data Processing Operations
  registry.register(new DataMergerOperation());
  registry.register(new DataFilterOperation());
  registry.register(new DataTransformerOperation());
  registry.register(new MarkdownConverterOperation());
  
  // File Operations
  registry.register(new JsonFileSaverOperation());
  registry.register(new MarkdownFileSaverOperation());
  registry.register(new CsvFileSaverOperation());
  
  console.log(`Successfully registered ${registry.getStatistics().totalOperations} operations`);
  
  return registry;
}

/**
 * Get operation by name
 * @param {string} operationName - Name of the operation to get
 * @returns {BaseOperation|undefined} Operation instance
 */
export function getOperation(operationName) {
  return globalRegistry.getOperation(operationName);
}

/**
 * Get all operations for a specific abstract category
 * @param {string} category - Abstract category
 * @returns {Array<BaseOperation>} Operations in category
 */
export function getOperationsByCategory(category) {
  return globalRegistry.getOperationsByCategory(category);
}

/**
 * Find operations matching criteria
 * @param {Object} criteria - Search criteria
 * @returns {Array<BaseOperation>} Matching operations
 */
export function findOperations(criteria) {
  return globalRegistry.findOperations(criteria);
}

/**
 * Match operations for an abstract step
 * @param {string} abstractCategory - Abstract category to match
 * @param {Object} context - Matching context
 * @param {string} forceOperation - Force specific operation
 * @returns {Array<Object>} Matched operations with scores
 */
export function matchOperations(abstractCategory, context = {}, forceOperation = null) {
  return globalRegistry.matchOperations(abstractCategory, context, forceOperation);
}

/**
 * Get the best operation match for an abstract step
 * @param {string} abstractCategory - Abstract category to match
 * @param {Object} context - Matching context
 * @param {string} forceOperation - Force specific operation
 * @returns {Object|null} Best match or null if no match
 */
export function getBestMatch(abstractCategory, context = {}, forceOperation = null) {
  return globalRegistry.getBestMatch(abstractCategory, context, forceOperation);
}

/**
 * Get framework statistics
 * @returns {Object} Framework statistics
 */
export function getFrameworkStats() {
  return globalRegistry.getStatistics();
}

/**
 * Create a custom operation registry
 * @returns {OperationRegistry} New registry instance
 */
export function createRegistry() {
  return new OperationRegistry();
}

// Auto-register all operations when this module is imported
if (typeof window === 'undefined') {
  // Node.js environment - auto-register disabled for testing
  // registerAllOperations();
}