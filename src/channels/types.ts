import type { ChannelName } from '../types.js';
import type { MessageTriggerSource } from '../storage/repositories/message-repo.js';

export interface ChannelLifecycleSummary {
  name: ChannelName;
  connected: boolean;
  configured: boolean;
}

export interface OutboundMessage {
  receiveId: string;
  receiveIdType: 'chat_id' | 'open_id' | 'user_id' | 'union_id';
  content: string;
  messageType?: 'text' | 'interactive' | 'post' | 'image' | 'file' | 'audio' | 'media' | 'sticker' | 'share_chat' | 'share_user';
  storageContext?: {
    chatId: string;
    groupName?: string;
    sessionId?: string;
    triggerSource?: MessageTriggerSource;
    sourceMessageId?: string;
  };
}

export interface Channel {
  readonly name: ChannelName;
  isConfigured(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(message: OutboundMessage): Promise<void>;
  getStatus(): ChannelLifecycleSummary;
}
