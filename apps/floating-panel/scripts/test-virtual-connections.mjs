// 本地自验证脚本：验证父容器 + 虚拟子容器的连线逻辑
// 目标：当父容器和虚拟子容器指向同一个 dom_path 时，只有子容器画线。

import { renderGraph } from '../src/renderer/graph/view.mts';

// 简单的 SVG stub
const makeNode = (tagName) => {
  const node = {
    tagName,
    attrs: {},
    children: [],
    style: {},
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener() {
      // no-op
    },
  };
  return node;
};

global.window = {
  DEBUG: '1',
};

global.document = {
  createElementNS(_ns, tagName) {
    return makeNode(tagName);
  },
};

const canvas = {
  firstChild: null,
  removeChild(child) {
    if (this.firstChild === child) {
      this.firstChild = null;
    }
  },
  appendChild(child) {
    this.firstChild = child;
  },
};

// 构造一个最小化的容器/DOM 树：
// parent 容器 + 一个虚拟子容器 child，二者都指向同一个 dom_path = 'root/1'
const containerData = {
  id: 'weibo_main_page.feed_post',
  name: '微博单条帖子',
  match: {
    nodes: [
      {
        dom_path: 'root/1',
        selector: "article[class*='Feed_wrap_']",
      },
    ],
  },
  metadata: {},
  children: [
    {
      id: 'weibo_main_page.feed_post.virtual_test',
      name: '测试虚拟子容器',
      metadata: {
        isVirtual: true,
        suggestedDomPath: 'root/1',
      },
      match: {
        nodes: [
          {
            dom_path: 'root/1',
          },
        ],
      },
      children: [],
    },
  ],
};

const domData = {
  path: 'root',
  children: [
    {
      path: 'root/1',
      children: [],
    },
  ],
};

const expandedNodes = new Set(['weibo_main_page.feed_post', 'weibo_main_page.feed_post.virtual_test', 'root']);
const domNodePositions = new Map();
const containerNodePositions = new Map();
const selectorMap = new Map();
const loadedPaths = new Set(['root']);

console.log('=== 开始虚拟子容器连线自测 ===');

await renderGraph(
  {
    canvas,
    containerData,
    domData,
    expandedNodes,
    graphOffset: { x: 0, y: 0 },
    graphScale: 1,
    selectedContainer: null,
    selectedDom: null,
    domNodePositions,
    containerNodePositions,
    selectorMap,
    suggestedNode: null,
    loadedPaths,
    currentProfile: null,
    currentRootSelector: null,
    currentUrl: null,
  },
  {
    fetchDomBranch: async () => null,
    mergeDomBranch: () => false,
    queueDomPathPreload: () => null,
  },
);

console.log('=== 自测结束，请检查上方 [drawConnectionsForNode] 日志 ===');
