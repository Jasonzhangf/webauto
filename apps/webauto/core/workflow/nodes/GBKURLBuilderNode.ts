// GBK URL 构建节点：将关键词按 GBK 编码为 %XX 格式并拼接到 URL
import BaseNode from './BaseNode';
import iconv from 'iconv-lite';

function encodeGBKPercent(str) {
  const buf = iconv.encode(String(str), 'gbk');
  let out = '';
  for (const b of buf) {
    out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

export default class GBKURLBuilderNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'GBKURLBuilderNode';
    this.description = '将关键词按 GBK 百分号编码后构建 1688 搜索 URL';
  }

  getConfigSchema() {
    return {
      type: 'object',
      required: ['baseUrl'],
      properties: {
        baseUrl: { type: 'string', description: '基础 URL（不含参数）' },
        paramName: { type: 'string', default: 'keywords', description: '关键词参数名' },
        keywordVar: { type: 'string', default: 'keyword', description: '从变量中读取的关键词变量名' },
        keywordText: { type: 'string', description: '直接提供的关键词文本（优先于变量）' },
        extraParams: { type: 'object', description: '其他附加查询参数（UTF-8 正常编码）' }
      }
    };
  }

  async execute(context: any, params: any): Promise<any> {
    const { config, variables, logger } = context;
    const baseUrl = String(config.baseUrl || '');
    const paramName = String(config.paramName || 'keywords');
    const keyword = (config.keywordText != null)
      ? String(config.keywordText)
      : String(variables.get(config.keywordVar || 'keyword', ''));
    const extra = (config.extraParams && typeof config.extraParams === 'object') ? config.extraParams : {};

    if (!baseUrl) return { success: false, error: 'baseUrl required' };
    if (!keyword) return { success: false, error: 'keyword missing' };

    try {
      const gbkEncoded = encodeGBKPercent(keyword);

      // 构造查询串：paramName=gbkEncoded + extraParams (UTF-8 encodeURIComponent)
      const extras = Object.entries(extra)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');

      const query = `${encodeURIComponent(paramName)}=${gbkEncoded}` + (extras ? `&${extras}` : '');
      const url = baseUrl.includes('?') ? `${baseUrl}&${query}` : `${baseUrl}?${query}`;

      logger.info(`✅ GBK URL 构建完成: ${url}`);
      return { success: true, variables: { targetUrl: url, keyword, gbkEncoded }, results: { url, keyword, gbkEncoded } };
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
  }
}

