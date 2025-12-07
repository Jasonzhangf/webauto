import { EventEmitter } from 'node:events';

class MessageBus extends EventEmitter {
  publish(topic, payload) {
    if (!topic) return;
    this.emit(topic, payload);
    this.emit('__broadcast__', { topic, payload });
  }

  subscribe(topic, handler) {
    this.on(topic, handler);
    return () => this.removeListener(topic, handler);
  }
}

export const messageBus = new MessageBus();
