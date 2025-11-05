// 节点注册器 - 管理所有节点类型的处理器
import StartNode from './nodes/StartNode.js';
import BrowserInitNode from './nodes/BrowserInitNode.js';
import CookieLoaderNode from './nodes/CookieLoaderNode.js';
import NavigationNode from './nodes/NavigationNode.js';
import LoginVerificationNode from './nodes/LoginVerificationNode.js';
import ScrollCaptureNode from './nodes/ScrollCaptureNode.js';
import PaginationCaptureNode from './nodes/PaginationCaptureNode.js';
import URLBuilderNode from './nodes/URLBuilderNode.js';
import ResultSaverNode from './nodes/ResultSaverNode.js';
import EndNode from './nodes/EndNode.js';
import ContentDownloadNode from './nodes/ContentDownloadNode.js';
import DownloadResultSaverNode from './nodes/DownloadResultSaverNode.js';
import FileReaderNode from './nodes/FileReaderNode.js';
import HaltNode from './nodes/HaltNode.js';
import AttachSessionNode from './nodes/AttachSessionNode.js';
import CookieSaverNode from './nodes/CookieSaverNode.js';
import WaitNode from './nodes/WaitNode.js';
import AntiBotMitigationNode from './nodes/AntiBotMitigationNode.js';
import ModalDismissNode from './nodes/ModalDismissNode.js';
import HandshakeSignalNode from './nodes/HandshakeSignalNode.js';
import BehaviorLogNode from './nodes/BehaviorLogNode.js';
import ContextExportNode from './nodes/ContextExportNode.js';
import SessionFinalizeNode from './nodes/SessionFinalizeNode.js';
import PopupTokenCaptureNode from './nodes/PopupTokenCaptureNode.js';
import CamoufoxEnsureNode from './nodes/CamoufoxEnsureNode.js';
import PageSnapshotNode from './nodes/PageSnapshotNode.js';
import ScriptTokenExtractorNode from './nodes/ScriptTokenExtractorNode.js';
import ChatComposeNode from './nodes/ChatComposeNode.js';
import ChatComposeNode1688 from './nodes/ChatComposeNode1688.js';
import ChatHighlightOnlyNode1688 from './nodes/ChatHighlightOnlyNode1688.js';
import ChatComposeNodeFinalV2 from './nodes/ChatComposeNodeFinalV2.js';
import SelectorProbeNode from './nodes/SelectorProbeNode.js';
import GateOverlayNode from './nodes/GateOverlayNode.js';
import MockBatchChatNode from './nodes/MockBatchChatNode.js';
import PlaywrightClickNode from './nodes/PlaywrightClickNode.js';
import JavaScriptExecutionNode from './nodes/JavaScriptExecutionNode.js';
import AdvancedClickNode from './nodes/AdvancedClickNode.js';
import InputNode from './nodes/InputNode.js';
import BatchClickNode from './nodes/BatchClickNode.js';
import GBKURLBuilderNode from './nodes/GBKURLBuilderNode.js';
import AttachHostPageNode from './nodes/AttachHostPageNode.js';
import EventDrivenOptionalClickNode from './nodes/EventDrivenOptionalClickNode.js';
import AnchorPointNode from './nodes/AnchorPointNode.js';
import InjectContainerIndexNode from './nodes/InjectContainerIndexNode.js';
import DevEvalNode from './nodes/DevEvalNode.js';
import CloseHostPageNode from './nodes/CloseHostPageNode.js';
import ConditionNode from './nodes/ConditionNode.js';
import SwitchWorkflowNode from './nodes/SwitchWorkflowNode.js';

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
