import { MSG_CONTAINER_ROOT_SCROLL_START } from '../../../../../libs/operations-framework/src/event-driven/MessageConstants.js';

interface MessageDefinition {
  name: string;
  description: string;
  payloadSchema?: string;
}

interface VariableDefinition {
  name: string;
  type: string;
  defaultValue?: string;
  required?: boolean;
}

export class RootConfigPanel {
  private containerId: string;
  private messages: MessageDefinition[] = [];
  private variables: Record<string, any> = {};
  private onUpdate: (type: 'message' | 'variable', data: any) => void;
  private element: HTMLElement;

  constructor(options: {
    containerId: string;
    messages: MessageDefinition[];
    variables: Record<string, any>;
    onUpdate: (type: 'message' | 'variable', data: any) => void;
  }) {
    this.containerId = options.containerId;
    this.messages = options.messages || [];
    this.variables = options.variables || {};
    this.onUpdate = options.onUpdate;
    this.element = document.createElement('div');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private render() {
    this.element.innerHTML = `
      <div class="root-config-panel" style="padding: 10px; background: #252526; border-bottom: 1px solid #3e3e3e;">
        <div style="margin-bottom: 10px; font-weight: bold; color: #ccc;">Root Container Configuration</div>
        
        <div class="tabs" style="display: flex; gap: 10px; border-bottom: 1px solid #3e3e3e; margin-bottom: 10px;">
          <button class="tab-btn active" data-tab="messages" style="background: none; border: none; color: #eee; padding: 5px 10px; cursor: pointer; border-bottom: 2px solid #007acc;">Messages</button>
          <button class="tab-btn" data-tab="variables" style="background: none; border: none; color: #888; padding: 5px 10px; cursor: pointer;">Variables</button>
        </div>

        <div id="messagesTab" class="tab-content">
          <div style="margin-bottom: 8px; display: flex; justify-content: space-between;">
            <span style="font-size: 12px; color: #888;">Custom Messages</span>
            <button id="btnAddMsg" style="background: #007acc; border: none; color: white; border-radius: 2px; padding: 2px 6px; font-size: 10px; cursor: pointer;">+ Add</button>
          </div>
          <div id="messageList" style="max-height: 120px; overflow-y: auto;">
            ${this.renderMessageList()}
          </div>
        </div>

        <div id="variablesTab" class="tab-content" style="display: none;">
          <div style="margin-bottom: 8px; display: flex; justify-content: space-between;">
            <span style="font-size: 12px; color: #888;">Global Variables</span>
            <button id="btnAddVar" style="background: #007acc; border: none; color: white; border-radius: 2px; padding: 2px 6px; font-size: 10px; cursor: pointer;">+ Add</button>
          </div>
          <div id="variableList" style="max-height: 120px; overflow-y: auto;">
            ${this.renderVariableList()}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderMessageList(): string {
    if (this.messages.length === 0) {
      return '<div style="color: #666; font-size: 11px; font-style: italic;">No custom messages defined</div>';
    }

    return this.messages.map(msg => `
      <div class="message-item" style="background: #2d2d2d; padding: 4px; margin-bottom: 4px; border-radius: 2px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="color: #dcdcaa; font-size: 11px; font-family: monospace;">${msg.name}</div>
          <div style="color: #888; font-size: 10px;">${msg.description || 'No description'}</div>
        </div>
        <button class="btn-del-msg" data-name="${msg.name}" style="background: none; border: none; color: #f44336; cursor: pointer;">×</button>
      </div>
    `).join('');
  }

  private renderVariableList(): string {
    const vars = Object.entries(this.variables);
    if (vars.length === 0) {
      return '<div style="color: #666; font-size: 11px; font-style: italic;">No variables defined</div>';
    }

    return vars.map(([key, value]) => `
      <div class="variable-item" style="background: #2d2d2d; padding: 4px; margin-bottom: 4px; border-radius: 2px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="color: #9cdcfe; font-size: 11px; font-family: monospace;">${key}</div>
          <div style="color: #ce9178; font-size: 10px;">${JSON.stringify(value)}</div>
        </div>
        <button class="btn-del-var" data-key="${key}" style="background: none; border: none; color: #f44336; cursor: pointer;">×</button>
      </div>
    `).join('');
  }

  private bindEvents() {
    // Tab switching
    const tabs = this.element.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).dataset.tab;
        
        // Update tab styles
        tabs.forEach(t => {
          (t as HTMLElement).style.color = '#888';
          (t as HTMLElement).style.borderBottom = 'none';
          t.classList.remove('active');
        });
        (e.target as HTMLElement).style.color = '#eee';
        (e.target as HTMLElement).style.borderBottom = '2px solid #007acc';
        (e.target as HTMLElement).classList.add('active');

        // Show content
        const messagesTab = this.element.querySelector('#messagesTab') as HTMLElement;
        const variablesTab = this.element.querySelector('#variablesTab') as HTMLElement;
        
        if (target === 'messages') {
          messagesTab.style.display = 'block';
          variablesTab.style.display = 'none';
        } else {
          messagesTab.style.display = 'none';
          variablesTab.style.display = 'block';
        }
      });
    });

    // Add Message Button
    const btnAddMsg = this.element.querySelector('#btnAddMsg');
    if (btnAddMsg) {
      btnAddMsg.addEventListener('click', () => {
        const name = prompt('Enter message name (e.g. MSG_CUSTOM_EVENT):');
        if (name) {
          this.messages.push({
            name,
            description: 'Custom message'
          });
          this.onUpdate('message', this.messages);
          this.render(); // Re-render to show new item
        }
      });
    }

    // Add Variable Button
    const btnAddVar = this.element.querySelector('#btnAddVar');
    if (btnAddVar) {
      btnAddVar.addEventListener('click', () => {
        const key = prompt('Enter variable name:');
        if (key) {
          const value = prompt('Enter initial value:');
          this.variables[key] = value;
          this.onUpdate('variable', this.variables);
          this.render();
        }
      });
    }

    // Delete buttons delegation
    this.element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('btn-del-msg')) {
        const name = target.dataset.name;
        this.messages = this.messages.filter(m => m.name !== name);
        this.onUpdate('message', this.messages);
        this.render();
      } else if (target.classList.contains('btn-del-var')) {
        const key = target.dataset.key;
        if (key) {
          delete this.variables[key];
          this.onUpdate('variable', this.variables);
          this.render();
        }
      }
    });
  }
}

export const ROOT_CONFIG_STYLES = `
.root-config-panel {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.root-config-panel .tabs {
  margin-bottom: 8px;
}
.root-config-panel .tab-btn {
  font-size: 11px;
}
.root-config-panel .tab-btn:hover {
  color: #eee !important;
}
.root-config-panel .tab-content {
  animation: fadeIn 0.2s;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;
