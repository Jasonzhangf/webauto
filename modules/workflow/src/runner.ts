import { WorkflowExecutor, type WorkflowExecutionResult } from '../blocks/WorkflowExecutor.js';
import { getWorkflowDefinition } from '../config/workflowRegistry.js';
import * as EnsureSession from '../blocks/EnsureSession.js';
import * as EnsureLoginBlock from '../blocks/EnsureLoginBlock.js';
import * as WaitSearchPermitBlock from '../blocks/WaitSearchPermitBlock.js';
import * as GoToSearchBlock from '../blocks/GoToSearchBlock.js';
import * as CollectSearchListBlock from '../blocks/CollectSearchListBlock.js';
import * as OpenDetailBlock from '../blocks/OpenDetailBlock.js';
import * as ExtractDetailBlock from '../blocks/ExtractDetailBlock.js';
import * as WarmupCommentsBlock from '../blocks/WarmupCommentsBlock.js';
import * as ExpandCommentsBlock from '../blocks/ExpandCommentsBlock.js';
import * as CollectCommentsBlock from '../blocks/CollectCommentsBlock.js';
import * as PersistXhsNoteBlock from '../blocks/PersistXhsNoteBlock.js';
import * as CloseDetailBlock from '../blocks/CloseDetailBlock.js';
import * as XiaohongshuFullCollectBlock from '../blocks/XiaohongshuFullCollectBlock.js';
import * as XiaohongshuCollectLinksBlock from '../blocks/XiaohongshuCollectLinksBlock.js';
import * as XiaohongshuCollectFromLinksBlock from '../blocks/XiaohongshuCollectFromLinksBlock.js';
import * as ErrorRecoveryBlock from '../blocks/ErrorRecoveryBlock.js';
import * as ExecuteWeiboSearchBlock from '../blocks/ExecuteWeiboSearchBlock.js';
import * as WeiboCollectSearchLinksBlock from '../blocks/WeiboCollectSearchLinksBlock.js';
import * as WeiboCollectFromLinksBlock from '../blocks/WeiboCollectFromLinksBlock.js';
import * as WeiboCollectCommentsBlock from '../blocks/WeiboCollectCommentsBlock.js';
import * as AnchorVerificationBlock from '../blocks/AnchorVerificationBlock.js';
import * as CallWorkflowBlock from '../blocks/CallWorkflowBlock.js';
import * as RecordFixtureBlock from '../blocks/RecordFixtureBlock.js';
import * as OrganizeXhsNotesBlock from '../blocks/OrganizeXhsNotesBlock.js';

export function createDefaultWorkflowExecutor(): WorkflowExecutor {
  const executor = new WorkflowExecutor();
  executor.registerBlock('EnsureSession', { execute: EnsureSession.execute });
  executor.registerBlock('EnsureLoginBlock', { execute: EnsureLoginBlock.execute });
  executor.registerBlock('WaitSearchPermitBlock', { execute: WaitSearchPermitBlock.execute });
  executor.registerBlock('GoToSearchBlock', { execute: GoToSearchBlock.execute });
  executor.registerBlock('CollectSearchListBlock', { execute: CollectSearchListBlock.execute });
  executor.registerBlock('OpenDetailBlock', { execute: OpenDetailBlock.execute });
  executor.registerBlock('ExtractDetailBlock', { execute: ExtractDetailBlock.execute });
  executor.registerBlock('WarmupCommentsBlock', { execute: WarmupCommentsBlock.execute });
  executor.registerBlock('ExpandCommentsBlock', { execute: ExpandCommentsBlock.execute });
  executor.registerBlock('CollectCommentsBlock', { execute: CollectCommentsBlock.execute });
  executor.registerBlock('CloseDetailBlock', { execute: CloseDetailBlock.execute });
  executor.registerBlock('ErrorRecoveryBlock', { execute: ErrorRecoveryBlock.execute });
  executor.registerBlock('AnchorVerificationBlock', { execute: AnchorVerificationBlock.execute });
  executor.registerBlock('CallWorkflowBlock', { execute: CallWorkflowBlock.execute });
  executor.registerBlock('PersistXhsNoteBlock', { execute: PersistXhsNoteBlock.execute });
  executor.registerBlock('RecordFixtureBlock', { execute: RecordFixtureBlock.execute });
  executor.registerBlock('XiaohongshuFullCollectBlock', { execute: XiaohongshuFullCollectBlock.execute });
  executor.registerBlock('XiaohongshuCollectLinksBlock', { execute: XiaohongshuCollectLinksBlock.execute });
  executor.registerBlock('XiaohongshuCollectFromLinksBlock', { execute: XiaohongshuCollectFromLinksBlock.execute });
  executor.registerBlock('OrganizeXhsNotesBlock', { execute: OrganizeXhsNotesBlock.execute });
  executor.registerBlock('ExecuteWeiboSearchBlock', { execute: ExecuteWeiboSearchBlock.execute });
  executor.registerBlock('WeiboCollectSearchLinksBlock', { execute: WeiboCollectSearchLinksBlock.execute });
  executor.registerBlock('WeiboCollectFromLinksBlock', { execute: WeiboCollectFromLinksBlock.execute });
  executor.registerBlock('WeiboCollectCommentsBlock', { execute: WeiboCollectCommentsBlock.execute });
  return executor;
}

export async function runWorkflowById(
  workflowId: string,
  initialContext: any,
): Promise<WorkflowExecutionResult> {
  const def = getWorkflowDefinition(workflowId);
  if (!def) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  const executor = createDefaultWorkflowExecutor();
  return executor.execute(def, initialContext);
}
