"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PageAnalysisSchema = exports.ObserveOptionsSchema = exports.ObservedElementSchema = void 0;
const zod_1 = require("zod");
// Schema验证
exports.ObservedElementSchema = zod_1.z.object({
    selector: zod_1.z.string(),
    description: zod_1.z.string(),
    method: zod_1.z.string(),
    arguments: zod_1.z.array(zod_1.z.string()),
    elementId: zod_1.z.string(),
    confidence: zod_1.z.number().min(0).max(1).optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
exports.ObserveOptionsSchema = zod_1.z.object({
    instruction: zod_1.z.string().optional(),
    selector: zod_1.z.string().optional(),
    includeMetadata: zod_1.z.boolean().default(false),
    confidenceThreshold: zod_1.z.number().min(0).max(1).default(0.7),
    returnAction: zod_1.z.boolean().default(false),
    onlyVisible: zod_1.z.boolean().optional(),
    drawOverlay: zod_1.z.boolean().default(false),
});
exports.PageAnalysisSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    title: zod_1.z.string(),
    type: zod_1.z.enum(['article', 'product', 'form', 'navigation', 'search', 'unknown']),
    mainContent: zod_1.z.object({
        selector: zod_1.z.string(),
        description: zod_1.z.string(),
    }).optional(),
    keyElements: zod_1.z.array(exports.ObservedElementSchema),
    suggestedOperations: zod_1.z.array(zod_1.z.object({
        operation: zod_1.z.any(),
        confidence: zod_1.z.number().min(0).max(1),
        reasoning: zod_1.z.string(),
        parameters: zod_1.z.record(zod_1.z.unknown()),
    })),
    metadata: zod_1.z.object({
        loadTime: zod_1.z.number(),
        elementCount: zod_1.z.number(),
        interactiveElements: zod_1.z.number(),
        accessibilityScore: zod_1.z.number().min(0).max(1).optional(),
    }),
});
// Types are already exported as interfaces above
//# sourceMappingURL=index.js.map