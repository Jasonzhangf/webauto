/**
 * OpenAI Compatible Providers Framework
 * Main Entry Point
 */

// Core Framework Components
const BasePipelineNode = require('./pipeline/BasePipelineNode');
const Pipeline = require('./pipeline/Pipeline');
const PipelineManager = require('./pipeline/PipelineManager');

// Pipeline Nodes
const LLMSwitchNode = require('./pipeline/LLMSwitchNode');
const WorkflowNode = require('./pipeline/WorkflowNode');
const CompatibilityNode = require('./pipeline/CompatibilityNode');
const ProviderNode = require('./pipeline/ProviderNode');

// Compatibility Components
const CompatibilityManager = require('./CompatibilityManager');
const GenericCompatibility = require('./compatibility/GenericCompatibility');

// Transformer Components
const Transformer = require('./pipeline/Transformer');
const TransformerManager = require('./pipeline/TransformerManager');
const AnthropicTransformer = require('./pipeline/transformers/AnthropicTransformer');
const OpenAITransformer = require('./pipeline/transformers/OpenAITransformer');
const GeminiTransformer = require('./pipeline/transformers/GeminiTransformer');
const PassThroughTransformer = require('./pipeline/transformers/PassThroughTransformer');
const UnifiedChatRequest = require('./pipeline/transformers/UnifiedChatRequest');
const UnifiedChatResponse = require('./pipeline/transformers/UnifiedChatResponse');

// Export all components
module.exports = {
  // Core Framework Components
  BasePipelineNode,
  Pipeline,
  PipelineManager,

  // Pipeline Nodes
  LLMSwitchNode,
  WorkflowNode,
  CompatibilityNode,
  ProviderNode,

  // Compatibility Components
  CompatibilityManager,
  GenericCompatibility,

  // Transformer Components
  Transformer,
  TransformerManager,
  AnthropicTransformer,
  OpenAITransformer,
  GeminiTransformer,
  PassThroughTransformer,
  UnifiedChatRequest,
  UnifiedChatResponse
};