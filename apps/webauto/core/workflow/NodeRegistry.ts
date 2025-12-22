// 节点注册器 - 管理所有节点类型的处理器
import StartNode from './nodes/StartNode';
import BrowserInitNode from './nodes/BrowserInitNode';
import CookieLoaderNode from './nodes/CookieLoaderNode';
import NavigationNode from './nodes/NavigationNode';
import LoginVerificationNode from './nodes/LoginVerificationNode';
import ScrollCaptureNode from './nodes/ScrollCaptureNode';
import PaginationCaptureNode from './nodes/PaginationCaptureNode';
import URLBuilderNode from './nodes/URLBuilderNode';
import ResultSaverNode from './nodes/ResultSaverNode';
import EndNode from './nodes/EndNode';
import ContentDownloadNode from './nodes/ContentDownloadNode';
import DownloadResultSaverNode from './nodes/DownloadResultSaverNode';
import FileReaderNode from './nodes/FileReaderNode';
import HaltNode from './nodes/HaltNode';
import AttachSessionNode from './nodes/AttachSessionNode';
import CookieSaverNode from './nodes/CookieSaverNode';
import WaitNode from './nodes/WaitNode';
import AntiBotMitigationNode from './nodes/AntiBotMitigationNode';
import ModalDismissNode from './nodes/ModalDismissNode';
import HandshakeSignalNode from './nodes/HandshakeSignalNode';
import BehaviorLogNode from './nodes/BehaviorLogNode';
import ContextExportNode from './nodes/ContextExportNode';
import SessionFinalizeNode from './nodes/SessionFinalizeNode';
import PopupTokenCaptureNode from './nodes/PopupTokenCaptureNode';
import CamoufoxEnsureNode from './nodes/CamoufoxEnsureNode';
import PageSnapshotNode from './nodes/PageSnapshotNode';
import ScriptTokenExtractorNode from './nodes/ScriptTokenExtractorNode';
import ChatComposeNode from './nodes/ChatComposeNode';
import ChatComposeNode1688 from './nodes/ChatComposeNode1688';
import ChatHighlightOnlyNode1688 from './nodes/ChatHighlightOnlyNode1688';
import ChatComposeNodeFinalV2 from './nodes/ChatComposeNodeFinalV2';
import SelectorProbeNode from './nodes/SelectorProbeNode';
import GateOverlayNode from './nodes/GateOverlayNode';
import MockBatchChatNode from './nodes/MockBatchChatNode';
import PlaywrightClickNode from './nodes/PlaywrightClickNode';
import JavaScriptExecutionNode from './nodes/JavaScriptExecutionNode';
import AdvancedClickNode from './nodes/AdvancedClickNode';
import InputNode from './nodes/InputNode';
import BatchClickNode from './nodes/BatchClickNode';
import GBKURLBuilderNode from './nodes/GBKURLBuilderNode';
import AttachHostPageNode from './nodes/AttachHostPageNode';
import EventDrivenOptionalClickNode from './nodes/EventDrivenOptionalClickNode';
import AnchorPointNode from './nodes/AnchorPointNode';
import InjectContainerIndexNode from './nodes/InjectContainerIndexNode';
import DevEvalNode from './nodes/DevEvalNode';
import CloseHostPageNode from './nodes/CloseHostPageNode';
import ConditionNode from './nodes/ConditionNode';
import SwitchWorkflowNode from './nodes/SwitchWorkflowNode';
import ContactHistoryNode from './nodes/ContactHistoryNode';
import ContainerAnchorNode from './nodes/ContainerAnchorNode';
import ContainerSelectNode from './nodes/ContainerSelectNode';
import ContainerActionNode from './nodes/ContainerActionNode';
import SelectNextUnsent1688Node from './nodes/SelectNextUnsent1688Node';
import PickUnsentFromListNode from './nodes/PickUnsentFromListNode';

class NodeRegistry {
    constructor() {
        this.nodeTypes = new Map();
        this.initializeDefaultNodes();
    }

    initializeDefaultNodes() {
        // 注册默认节点类型
        this.registerNode('StartNode', new StartNode());
        this.registerNode('BrowserInitNode', new BrowserInitNode());
        this.registerNode('CookieLoaderNode', new CookieLoaderNode());
        this.registerNode('NavigationNode', new NavigationNode());
        this.registerNode('LoginVerificationNode', new LoginVerificationNode());
        this.registerNode('ScrollCaptureNode', new ScrollCaptureNode());
        this.registerNode('PaginationCaptureNode', new PaginationCaptureNode());
        this.registerNode('URLBuilderNode', new URLBuilderNode());
        this.registerNode('ResultSaverNode', new ResultSaverNode());
        this.registerNode('EndNode', new EndNode());
        this.registerNode('ContentDownloadNode', new ContentDownloadNode());
        this.registerNode('DownloadResultSaverNode', new DownloadResultSaverNode());
        this.registerNode('FileReaderNode', new FileReaderNode());
        this.registerNode('HaltNode', new HaltNode());
        this.registerNode('AttachSessionNode', new AttachSessionNode());
        this.registerNode('CookieSaverNode', new CookieSaverNode());
        this.registerNode('WaitNode', new WaitNode());
        this.registerNode('AntiBotMitigationNode', new AntiBotMitigationNode());
        this.registerNode('ModalDismissNode', new ModalDismissNode());
        this.registerNode('HandshakeSignalNode', new HandshakeSignalNode());
        this.registerNode('BehaviorLogNode', new BehaviorLogNode());
        this.registerNode('ContextExportNode', new ContextExportNode());
        this.registerNode('SessionFinalizeNode', new SessionFinalizeNode());
        this.registerNode('PopupTokenCaptureNode', new PopupTokenCaptureNode());
        this.registerNode('CamoufoxEnsureNode', new CamoufoxEnsureNode());
        this.registerNode('PageSnapshotNode', new PageSnapshotNode());
        this.registerNode('ScriptTokenExtractorNode', new ScriptTokenExtractorNode());
        this.registerNode('ChatComposeNode', new ChatComposeNode());
        this.registerNode('ChatComposeNode1688', new ChatComposeNode1688());
        this.registerNode('ChatHighlightOnlyNode1688', new ChatHighlightOnlyNode1688());
        this.registerNode('ChatComposeNodeFinalV2', new ChatComposeNodeFinalV2());
        this.registerNode('SelectorProbeNode', new SelectorProbeNode());
        this.registerNode('GateOverlayNode', new GateOverlayNode());
        this.registerNode('MockBatchChatNode', new MockBatchChatNode());
        this.registerNode('PlaywrightClickNode', new PlaywrightClickNode());
        this.registerNode('JavaScriptExecutionNode', new JavaScriptExecutionNode());
        this.registerNode('AdvancedClickNode', new AdvancedClickNode());
        this.registerNode('InputNode', new InputNode());
        this.registerNode('BatchClickNode', new BatchClickNode());
        this.registerNode('GBKURLBuilderNode', new GBKURLBuilderNode());
        this.registerNode('AttachHostPageNode', new AttachHostPageNode());
        this.registerNode('EventDrivenOptionalClickNode', new EventDrivenOptionalClickNode());
        this.registerNode('AnchorPointNode', new AnchorPointNode());
        this.registerNode('InjectContainerIndexNode', new InjectContainerIndexNode());
        this.registerNode('DevEvalNode', new DevEvalNode());
        this.registerNode('CloseHostPageNode', new CloseHostPageNode());
        this.registerNode('ConditionNode', new ConditionNode());
        this.registerNode('SwitchWorkflowNode', new SwitchWorkflowNode());
        this.registerNode('ContactHistoryNode', new ContactHistoryNode());
        this.registerNode('ContainerAnchorNode', new ContainerAnchorNode());
        this.registerNode('ContainerSelectNode', new ContainerSelectNode());
        this.registerNode('ContainerActionNode', new ContainerActionNode());
        this.registerNode('SelectNextUnsent1688Node', new SelectNextUnsent1688Node());
        this.registerNode('PickUnsentFromListNode', new PickUnsentFromListNode());
    }

    registerNode(type, handler) {
        this.nodeTypes.set(type, handler);
    }

    getNodeHandler(type) {
        return this.nodeTypes.get(type);
    }

    getAvailableNodeTypes() {
        return Array.from(this.nodeTypes.keys());
    }

    getNodeInfo(type) {
        const handler = this.nodeTypes.get(type);
        if (handler) {
            return {
                type: type,
                name: handler.name || type,
                description: handler.description || '',
                config: handler.getConfigSchema() || {},
                inputs: handler.getInputs() || [],
                outputs: handler.getOutputs() || []
            };
        }
        return null;
    }

    getAllNodeInfo() {
        return this.getAvailableNodeTypes().map(type => this.getNodeInfo(type));
    }
}

export default NodeRegistry;
