// Weibo adapter for the event-driven v3 runtime.
// Browser facts stay in WeiboBrowser; control facts stay in EventStore.

import { EventStore } from '../../../modules/webauto-v3/src/event-store.mjs';
import { PageDagRuntime } from '../../../modules/webauto-v3/src/page-dag.mjs';
import { buildObservation } from '../../../modules/webauto-v3/src/container.mjs';
import { makeArtifactDigest, newRunId } from '../../../modules/webauto-v3/src/ids.mjs';
import { makeGuardResult } from '../../../modules/webauto-v3/src/contracts.mjs';
import { riskGuard } from '../../../modules/webauto-v3/src/guards.mjs';

function allowGuard({ guardId, observation, diagnostics = {} }) {
  return makeGuardResult({
    verdict: 'allow',
    guard_id: guardId,
    guard_version: 'v1',
    subject_ref: observation?.revision || '',
    diagnostics,
  });
}

function anchorGuard(anchorName, observation, guardId) {
  const anchor = observation?.anchors?.[anchorName];
  const count = Number(anchor?.count || 0);
  const visible = anchor?.visible === true;
  if (!anchor || count <= 0 || !visible) {
    return makeGuardResult({
      verdict: 'deny',
      guard_id: guardId,
      guard_version: 'v1',
      subject_ref: observation?.revision || '',
      diagnostics: { anchor: anchorName, count, visible },
      reason_code: count > 0 ? 'anchor_not_visible' : 'anchor_empty',
    });
  }
  return makeGuardResult({
    verdict: 'allow',
    guard_id: guardId,
    guard_version: 'v1',
    subject_ref: observation?.revision || '',
    diagnostics: { anchor: anchorName, count, visible },
  });
}

function actionGuard(observation) {
  const result = riskGuard({
    url: observation?.url || '',
    title: observation?.title || '',
    bodyText: observation?.text_digest || '',
  });
  if (result.verdict !== 'allow') return result;
  return allowGuard({
    guardId: 'weibo.action.precondition',
    observation,
    diagnostics: { url: observation?.url || '' },
  });
}

function normalizeBinding(binding, pageDagId) {
  return {
    workflow_run_id: binding.workflow_run_id || null,
    workflow_node_id: binding.workflow_node_id || pageDagId,
    binding_id: binding.binding_id || pageDagId,
    item_key: binding.item_key || '',
    invocation_id: binding.invocation_id || null,
    attempt: Number(binding.attempt || 1),
  };
}

export class WeiboRuntime {
  constructor({
    runId = newRunId('weibo'),
    profileId = null,
    eventDir = null,
    eventStore = null,
  } = {}) {
    this.runId = runId;
    this.profileId = profileId;
    this.eventStore = eventStore || new EventStore({ runId, dir: eventDir || undefined });
    this._artifactGenerations = new Map();
    this.eventStore.append({
      type: 'RunStarted',
      source: 'weibo-v3',
      payload: { profile_id: profileId },
    });
  }

  async observe(browser, selectors) {
    const pageInfo = await browser.pageInfo();
    const anchors = await browser.observeAnchors(selectors || {});
    return {
      ...buildObservation({ profileId: this.profileId, pageInfo }),
      anchors,
    };
  }

  async runPage({
    pageDagId,
    browser,
    selectors = {},
    nodes = [],
    binding = {},
    executor = null,
    extractors = {},
    postAnchorTimeoutMs = 15_000,
    postAnchorPollMs = 250,
  }) {
    if (!pageDagId) throw new Error('WeiboRuntime.runPage requires pageDagId');
    if (!browser) throw new Error('WeiboRuntime.runPage requires browser');
    const identity = normalizeBinding(binding, pageDagId);
    const runtime = new PageDagRuntime({
      pageDagId,
      pageDagVersion: 'v1',
      nodes,
      eventStore: this.eventStore,
      observer: () => this.observe(browser, selectors),
      executor,
      postAnchorTimeoutMs,
      postAnchorPollMs,
      guards: {
        Act: ({ observation }) => actionGuard(observation),
        Extract: ({ observation }) => allowGuard({
          guardId: `${pageDagId}.extract`,
          observation,
        }),
        postAnchor: ({ anchorName, observation }) => anchorGuard(
          anchorName,
          observation,
          `${pageDagId}.post_anchor`,
        ),
        extract: async ({ node, observation, context, binding: currentBinding }) => {
          const extractor = extractors[node.node_id] || extractors.default;
          if (!extractor) throw new Error(`missing extractor for ${pageDagId}:${node.node_id}`);
          return extractor({ node, observation, context, binding: currentBinding, runtime: this });
        },
      },
    });
    return runtime.run(identity);
  }

  recordArtifact({
    artifactType,
    artifactId,
    payload,
    path = null,
    producerOperationId = null,
  }) {
    if (!artifactType || !artifactId) {
      throw new Error('recordArtifact requires artifactType and artifactId');
    }
    const generation = (this._artifactGenerations.get(artifactId) || 0) + 1;
    this._artifactGenerations.set(artifactId, generation);
    const contentDigest = makeArtifactDigest(payload);
    const event = this.eventStore.append({
      type: 'ArtifactProduced',
      source: 'weibo-artifact',
      operation_id: producerOperationId,
      payload: {
        artifact_id: artifactId,
        artifact_generation: generation,
        content_digest: contentDigest,
        artifact_type: artifactType,
        producer_operation_id: producerOperationId,
        path,
      },
    });
    return {
      artifact_id: artifactId,
      artifact_generation: generation,
      content_digest: contentDigest,
      artifact_type: artifactType,
      path,
      event,
    };
  }

  validateArtifact({
    artifact,
    validationSpecId,
    result,
    observedCount = null,
    expectedCount = null,
    missingFields = [],
    evidenceRef = null,
  }) {
    if (!artifact?.artifact_id || !artifact?.artifact_generation || !artifact?.content_digest) {
      throw new Error('validateArtifact requires immutable artifact identity');
    }
    const payload = {
      artifact_id: artifact.artifact_id,
      artifact_generation: artifact.artifact_generation,
      content_digest: artifact.content_digest,
      validation_spec_id: validationSpecId,
      result,
      observed_count: observedCount,
      expected_count: expectedCount,
      missing_fields: missingFields,
      evidence_ref: evidenceRef,
    };
    const event = this.eventStore.append({
      type: 'ArtifactValidated',
      source: 'weibo-artifact',
      payload,
    });
    return { ...payload, event };
  }

  finish(status, payload = {}) {
    return this.eventStore.append({
      type: status === 'succeeded' ? 'RunCompleted' : 'RunFailed',
      source: 'weibo-v3',
      payload: { status, ...payload },
    });
  }
}

export function createWeiboRuntime(options = {}) {
  return new WeiboRuntime(options);
}
