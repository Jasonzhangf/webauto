// Event-driven Page DAG runtime.
// Nodes are acyclic. Loops are explicit bounded macro nodes.
// Every browser write follows pre-guard -> operation -> post-observation ->
// post-guard -> typed event.

import { makeInvocationId } from './ids.mjs';

const DEFAULT_POST_ANCHOR_TIMEOUT_MS = 15_000;
const DEFAULT_POST_ANCHOR_POLL_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PageDagRuntime {
  constructor({
    pageDagId,
    pageDagVersion = 'v1',
    nodes = [],
    observer,
    guards = {},
    executor,
    eventStore,
    maxSteps = 40,
    postAnchorTimeoutMs = DEFAULT_POST_ANCHOR_TIMEOUT_MS,
    postAnchorPollMs = DEFAULT_POST_ANCHOR_POLL_MS,
  }) {
    if (!pageDagId) throw new Error('PageDagRuntime requires pageDagId');
    if (!eventStore) throw new Error('PageDagRuntime requires eventStore');
    this.pageDagId = pageDagId;
    this.pageDagVersion = pageDagVersion;
    this.nodes = nodes;
    this.observer = observer;
    this.guards = guards;
    this.executor = executor;
    this.eventStore = eventStore;
    this.maxSteps = maxSteps;
    this.postAnchorTimeoutMs = postAnchorTimeoutMs;
    this.postAnchorPollMs = postAnchorPollMs;
  }

  _event(type, fields = {}) {
    return this.eventStore.append({
      type,
      source: fields.source || 'page-dag',
      ...fields,
    });
  }

  async _observe(binding = {}, nodeId = null) {
    const observation = await this.observer();
    this._event('ObservationCaptured', {
      node_id: nodeId,
      page_revision: observation.revision,
      workflow_run_id: binding.workflow_run_id,
      workflow_node_id: binding.workflow_node_id,
      binding_id: binding.binding_id,
      invocation_id: binding.invocation_id,
      item_key: binding.item_key,
      payload: observation,
    });
    return observation;
  }

  _binding(identity = {}) {
    if (identity.invocation_id) return identity;
    const attempt = identity.attempt || 1;
    const invocationId = makeInvocationId({
      workflowRunId: identity.workflow_run_id,
      workflowNodeId: identity.workflow_node_id,
      bindingId: identity.binding_id,
      itemKey: identity.item_key,
      attempt,
    });
    return { ...identity, attempt, invocation_id: invocationId };
  }

  _guardResult(node, observation, context) {
    const guard = this.guards[node.kind] || this.guards[node.node_id];
    if (!guard) {
      return {
        verdict: 'unknown',
        guard_id: `${node.node_id}.missing`,
        guard_version: this.pageDagVersion,
        subject_ref: observation?.revision || '',
        evidence_ref: null,
        diagnostics: {},
        reason_code: 'guard_missing',
      };
    }
    return guard({ node, observation, context, runtime: this });
  }

  _recordGuard(node, observation, binding, guardResult, phase) {
    this._event('GuardVerdictIssued', {
      node_id: node.node_id,
      page_revision: observation?.revision || null,
      workflow_run_id: binding.workflow_run_id,
      workflow_node_id: binding.workflow_node_id,
      binding_id: binding.binding_id,
      invocation_id: binding.invocation_id,
      item_key: binding.item_key,
      payload: { phase, result: guardResult },
    });
  }

  async run(identity = {}) {
    const binding = this._binding(identity);
    const context = {
      page_dag_id: this.pageDagId,
      page_dag_version: this.pageDagVersion,
      binding,
      outputs: {},
    };
    let observation = await this._observe(binding);
    let steps = 0;
    let nodeIndex = 0;
    while (nodeIndex < this.nodes.length && steps < this.maxSteps) {
      steps++;
      const node = this.nodes[nodeIndex];
      this._event('PageNodeEntered', {
        node_id: node.node_id,
        page_revision: observation.revision,
        workflow_run_id: binding.workflow_run_id,
        workflow_node_id: binding.workflow_node_id,
        binding_id: binding.binding_id,
        invocation_id: binding.invocation_id,
        item_key: binding.item_key,
        payload: { kind: node.kind },
      });
      const preGuard = this._guardResult(node, observation, context);
      this._recordGuard(node, observation, binding, preGuard, 'pre');
      if (preGuard.verdict === 'risk_control') {
        this._event('RiskControlDetected', {
          node_id: node.node_id,
          page_revision: observation.revision,
          workflow_run_id: binding.workflow_run_id,
          workflow_node_id: binding.workflow_node_id,
          binding_id: binding.binding_id,
          invocation_id: binding.invocation_id,
          item_key: binding.item_key,
          payload: preGuard,
        });
      }
      if (preGuard.verdict !== 'allow') {
        const failure = {
          node_id: node.node_id,
          verdict: preGuard.verdict,
          reason_code: preGuard.reason_code || null,
        };
        this._event('PageNodeFailed', {
          node_id: node.node_id,
          page_revision: observation.revision,
          workflow_run_id: binding.workflow_run_id,
          workflow_node_id: binding.workflow_node_id,
          binding_id: binding.binding_id,
          invocation_id: binding.invocation_id,
          item_key: binding.item_key,
          payload: failure,
        });
        return { status: 'failed', ...failure, observation };
      }
      let result;
      try {
        result = await this._executeNode(node, observation, context, binding);
      } catch (error) {
        const failure = {
          node_id: node.node_id,
          verdict: 'unknown',
          reason_code: 'node_exception',
          message: error?.message || String(error),
        };
        this._event('PageNodeFailed', {
          node_id: node.node_id,
          page_revision: observation.revision,
          workflow_run_id: binding.workflow_run_id,
          workflow_node_id: binding.workflow_node_id,
          binding_id: binding.binding_id,
          invocation_id: binding.invocation_id,
          item_key: binding.item_key,
          payload: failure,
        });
        return { status: 'failed', ...failure, observation };
      }
      if (result?.failed) {
        const failure = {
          node_id: node.node_id,
          verdict: 'deny',
          reason_code: result.reason_code || 'operation_failed_replay',
          terminal_status: result.terminal_status ?? null,
        };
        this._event('PageNodeFailed', {
          node_id: node.node_id,
          page_revision: observation.revision,
          workflow_run_id: binding.workflow_run_id,
          workflow_node_id: binding.workflow_node_id,
          binding_id: binding.binding_id,
          invocation_id: binding.invocation_id,
          item_key: binding.item_key,
          payload: failure,
        });
        return { status: 'failed', ...failure, observation };
      }
      if (result?.observation) {
        observation = result.observation;
      } else {
        observation = await this._observe(binding, node.node_id);
      }
      if (node.post_anchors?.length) {
        for (const anchorName of node.post_anchors) {
          const waited = await this._waitForPostAnchor(anchorName, node, binding, observation);
          observation = waited.observation;
          const postGuard = waited.guard;
          this._recordGuard(node, observation, binding, postGuard, 'post');
          if (postGuard.verdict !== 'allow') {
            this._event('PageNodeFailed', {
              node_id: node.node_id,
              page_revision: observation.revision,
              workflow_run_id: binding.workflow_run_id,
              workflow_node_id: binding.workflow_node_id,
              binding_id: binding.binding_id,
              invocation_id: binding.invocation_id,
              item_key: binding.item_key,
              payload: { node_id: node.node_id, verdict: postGuard.verdict, anchor: anchorName },
            });
            return {
              status: 'failed',
              node_id: node.node_id,
              verdict: postGuard.verdict,
              reason_code: postGuard.reason_code || null,
              anchor: anchorName,
              observation,
            };
          }
        }
      }
      this._event('PageNodeCompleted', {
        node_id: node.node_id,
        page_revision: observation.revision,
        workflow_run_id: binding.workflow_run_id,
        workflow_node_id: binding.workflow_node_id,
        binding_id: binding.binding_id,
        invocation_id: binding.invocation_id,
        item_key: binding.item_key,
        payload: { kind: node.kind, outputs: result?.outputs || null },
      });
      if (result?.outputs) {
        Object.assign(context.outputs, result.outputs);
      }
      nodeIndex++;
    }
    if (nodeIndex < this.nodes.length) {
      const node = this.nodes[nodeIndex];
      const failure = {
        node_id: node?.node_id || null,
        verdict: 'unknown',
        reason_code: 'max_steps_exceeded',
      };
      this._event('PageNodeFailed', {
        node_id: failure.node_id,
        page_revision: observation.revision,
        workflow_run_id: binding.workflow_run_id,
        workflow_node_id: binding.workflow_node_id,
        binding_id: binding.binding_id,
        invocation_id: binding.invocation_id,
        item_key: binding.item_key,
        payload: failure,
      });
      return { status: 'failed', ...failure, observation };
    }
    return {
      status: 'succeeded',
      page_dag_id: this.pageDagId,
      page_dag_version: this.pageDagVersion,
      outputs: context.outputs,
      observation,
    };
  }

  async _waitForPostAnchor(anchorName, node, binding, initialObservation) {
    const deadline = Date.now() + Math.max(0, Number(this.postAnchorTimeoutMs) || 0);
    const pollMs = Math.max(0, Number(this.postAnchorPollMs) || 0);
    let observation = initialObservation;
    let guard = structuralPostGuard(anchorName, observation, node, this);
    while (guard.verdict !== 'allow' && Date.now() < deadline) {
      if (pollMs > 0) await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
      observation = await this._observe(binding, node.node_id);
      guard = structuralPostGuard(anchorName, observation, node, this);
    }
    return { observation, guard };
  }

  async _executeNode(node, observation, context, binding) {
    if (node.kind === 'Extract') {
      const extractor = this.guards.extract || null;
      const value = extractor
        ? await extractor({ node, observation, context, runtime: this, binding })
        : null;
      return { outputs: { [node.node_id]: value } };
    }
    if (node.kind === 'Act') {
      const idempotencyKey = `${binding.invocation_id}:${node.node_id}`;
      const terminal = this.eventStore.terminalStatus(idempotencyKey);
      if (terminal) {
        // Only a succeeded terminal is a replay of a completed operation. A
        // recorded failure must stay a failure: replaying it as a normal node
        // result would let a page DAG report success for an operation that
        // never actually succeeded in the browser.
        if (terminal.status !== 'succeeded') {
          return {
            failed: true,
            reason_code: 'operation_failed_replay',
            terminal_status: terminal.status,
          };
        }
        return {
          outputs: {
            idempotent_replay: true,
            terminal_status: terminal.status,
          },
        };
      }
      this._event('OperationRequested', {
        node_id: node.node_id,
        page_revision: observation.revision,
        operation_id: `${node.node_id}:operation`,
        idempotency_key: idempotencyKey,
        workflow_run_id: binding.workflow_run_id,
        workflow_node_id: binding.workflow_node_id,
        binding_id: binding.binding_id,
        invocation_id: binding.invocation_id,
        item_key: binding.item_key,
        payload: {
          operation_kind: node.operation_kind || null,
          args: node.operation_args || {},
        },
      });
      this._event('OperationAdmitted', {
        node_id: node.node_id,
        page_revision: observation.revision,
        operation_id: `${node.node_id}:operation`,
        idempotency_key: idempotencyKey,
        workflow_run_id: binding.workflow_run_id,
        workflow_node_id: binding.workflow_node_id,
        binding_id: binding.binding_id,
        invocation_id: binding.invocation_id,
        item_key: binding.item_key,
        payload: {},
      });
      if (!this.executor) throw new Error('PageDagRuntime requires executor for Act nodes');
      const execution = await this.executor(node, observation, context);
      const terminalType = execution?.ok === false ? 'OperationFailed' : 'OperationSucceeded';
      this._event(terminalType, {
        node_id: node.node_id,
        page_revision: observation.revision,
        operation_id: `${node.node_id}:operation`,
        idempotency_key: idempotencyKey,
        workflow_run_id: binding.workflow_run_id,
        workflow_node_id: binding.workflow_node_id,
        binding_id: binding.binding_id,
        invocation_id: binding.invocation_id,
        item_key: binding.item_key,
        payload: execution || {},
      });
      if (terminalType === 'OperationFailed') {
        throw new Error(execution?.error || 'operation failed');
      }
      return { outputs: execution?.outputs || null };
    }
    throw new Error(`unsupported page DAG node kind: ${node.kind}`);
  }
}

function structuralPostGuard(anchorName, observation, node, runtime) {
  const evaluator = runtime.guards.postAnchor;
  if (!evaluator) {
    return {
      verdict: 'unknown',
      guard_id: `${node.node_id}.post_anchor`,
      guard_version: runtime.pageDagVersion,
      subject_ref: observation.revision,
      evidence_ref: null,
      diagnostics: { anchor: anchorName },
      reason_code: 'post_anchor_evaluator_missing',
    };
  }
  return evaluator({ anchorName, observation, node, runtime });
}
