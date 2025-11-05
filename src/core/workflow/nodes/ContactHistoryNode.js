// 联系历史节点：检查或记录已发送对象，避免重复发送
import BaseNode from './BaseNode.js';
import { has1688, add1688 } from '../ContactStore.ts';

export default class ContactHistoryNode extends BaseNode {
  constructor() {
    super();
    this.name = 'ContactHistoryNode';
    this.description = '检查/记录 1688 聊天发送历史（按 key/uid/offerId/chatUrl）';
  }

  async execute(context) {
    const { variables, logger, config } = context;
    try {
      const action = (config?.action || 'check').toLowerCase(); // 'check' | 'add'
      const site = (config?.site || '1688').toLowerCase();
      if (site !== '1688') return { success: true };

      const keyVar = config?.keyVarName || 'contactKey';
      const uidVar = config?.uidVarName || 'contactUid';
      const offerVar = config?.offerIdVarName || 'contactOfferId';
      const urlVar = config?.urlVarName || 'chatUrl';

      const data = {
        key: variables.get(keyVar) || null,
        uid: variables.get(uidVar) || null,
        offerId: variables.get(offerVar) || null,
        chatUrl: variables.get(urlVar) || null
      };

      if (action === 'check') {
        const exists = has1688(data);
        logger.info(`📒 历史检查: ${exists ? '已发送' : '未发送'}`);
        return { success: true, variables: { alreadySent: exists } };
      } else if (action === 'add') {
        const rec = add1688(data);
        logger.info('📝 已记录发送对象');
        return { success: true, variables: { contactRecordedAt: rec.lastSentAt } };
      } else {
        return { success: true };
      }
    } catch (e) {
      logger.warn('⚠️ 联系历史节点异常: ' + (e?.message || e));
      return { success: true };
    }
  }

  getConfigSchema(){
    return {
      type:'object',
      properties:{
        action:{ type:'string', enum:['check','add'], default:'check' },
        site:{ type:'string', default:'1688' },
        keyVarName:{ type:'string', default:'contactKey' },
        uidVarName:{ type:'string', default:'contactUid' },
        offerIdVarName:{ type:'string', default:'contactOfferId' },
        urlVarName:{ type:'string', default:'chatUrl' }
      }
    };
  }
}

