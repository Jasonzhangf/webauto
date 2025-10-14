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
import CamoufoxEnsureNode from './nodes/CamoufoxEnsureNode.js';

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
        this.registerNode('CamoufoxEnsureNode', new CamoufoxEnsureNode());
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
