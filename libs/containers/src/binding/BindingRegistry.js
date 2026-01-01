// ESM runtime implementation of BindingRegistry, aligned with BindingRegistry.ts

/**
 * @typedef {Object} BindingRuleTrigger
 * @property {'message' | 'event' | 'container_state'} type
 * @property {string} pattern
 */

/**
 * @typedef {Object} BindingRuleTarget
 * @property {string=} containerType
 * @property {string=} containerId
 * @property {(graph: any) => (string | null)=} selector
 */

/**
 * @typedef {Object} BindingRuleAction
 * @property {string} operationType
 * @property {Record<string, any>=} config
 */

/**
 * @typedef {Object} BindingRule
 * @property {string} id
 * @property {BindingRuleTrigger} trigger
 * @property {BindingRuleTarget} target
 * @property {BindingRuleAction} action
 * @property {(context: any) => boolean=} condition
 */

export class BindingRegistry {
  /**
   * @param {any=} eventBus
   */
  constructor(eventBus) {
    /** @type {Map<string, BindingRule>} */
    this.rules = new Map();
    this.eventBus = eventBus || null;
  }

  /**
   * @param {BindingRule} rule
   */
  register(rule) {
    if (this.rules.has(rule.id)) {
      console.warn(`[BindingRegistry] Rule ${rule.id} already exists, overwriting.`);
    }
    this.rules.set(rule.id, rule);

    if (this.eventBus && rule.trigger.type === 'event') {
      this.eventBus.on(rule.trigger.pattern, async (data) => {
        await this.executeRule(rule, data);
      });
    }
  }

  /**
   * @param {string} ruleId
   */
  unregister(ruleId) {
    this.rules.delete(ruleId);
  }

  /**
   * @returns {BindingRule[]}
   */
  getRules() {
    return Array.from(this.rules.values());
  }

  /**
   * @param {string} triggerType
   * @param {string=} pattern
   * @returns {BindingRule[]}
   */
  findRulesByTrigger(triggerType, pattern) {
    return Array.from(this.rules.values()).filter((rule) => {
      if (rule.trigger.type !== triggerType) return false;
      if (pattern && !this.matchPattern(rule.trigger.pattern, pattern)) return false;
      return true;
    });
  }

  /**
   * @param {BindingRule} rule
   * @param {any} context
   */
  async executeRule(rule, context) {
    if (rule.condition && !rule.condition(context)) {
      console.log(`[BindingRegistry] Rule ${rule.id} condition not met`);
      return { success: false, reason: 'condition_not_met' };
    }

    let targetContainerId = null;
    if (rule.target.containerId) {
      targetContainerId = rule.target.containerId;
    } else if (rule.target.selector && context && context.graph) {
      targetContainerId = rule.target.selector(context.graph);
    }

    if (!targetContainerId) {
      console.warn(
        `[BindingRegistry] Rule ${rule.id} failed to find target container`,
      );
      return { success: false, reason: 'target_not_found' };
    }

    console.log(
      `[BindingRegistry] Executing rule ${rule.id} on container ${targetContainerId} with action ${rule.action.operationType}`,
    );

    if (this.eventBus) {
      await this.eventBus.emit(`operation:${targetContainerId}:execute`, {
        containerId: targetContainerId,
        operationType: rule.action.operationType,
        config: rule.action.config || {},
        sourceRule: rule.id,
      });
    }

    return { success: true, targetContainerId, operationType: rule.action.operationType };
  }

  /**
   * @param {string} messageName
   * @param {any} payload
   * @param {any} context
   */
  async handleMessage(messageName, payload, context) {
    const rules = this.findRulesByTrigger('message', messageName);
    const results = [];
    for (const rule of rules) {
      const result = await this.executeRule(rule, { ...context, message: payload });
      results.push(result);
    }
    return results;
  }

  /**
   * @param {string} pattern
   * @param {string} value
   */
  matchPattern(pattern, value) {
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }
}

export default BindingRegistry;

