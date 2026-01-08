import { WorkflowExecutor, type WorkflowExecutionResult } from '../blocks/WorkflowExecutor';
import { getWorkflowDefinition } from '../config/workflowRegistry';
import * as EnsureSession from '../blocks/EnsureSession';
import * as EnsureLoginBlock from '../blocks/EnsureLoginBlock';
import * as WaitSearchPermitBlock from '../blocks/WaitSearchPermitBlock';
import * as GoToSearchBlock from '../blocks/GoToSearchBlock';
import * as CollectSearchListBlock from '../blocks/CollectSearchListBlock';
import * as OpenDetailBlock from '../blocks/OpenDetailBlock';
import * as ExtractDetailBlock from '../blocks/ExtractDetailBlock';
import * as WarmupCommentsBlock from '../blocks/WarmupCommentsBlock';
import * as ExpandCommentsBlock from '../blocks/ExpandCommentsBlock';
import * as CollectCommentsBlock from '../blocks/CollectCommentsBlock';
import * as PersistXhsNoteBlock from '../blocks/PersistXhsNoteBlock';
import * as CloseDetailBlock from '../blocks/CloseDetailBlock';
import * as ErrorRecoveryBlock from '../blocks/ErrorRecoveryBlock';
import * as AnchorVerificationBlock from '../blocks/AnchorVerificationBlock';
import * as CallWorkflowBlock from '../blocks/CallWorkflowBlock';
import * as RecordFixtureBlock from '../blocks/RecordFixtureBlock';

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
