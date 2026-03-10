export type LayerName =
  | 'bootstrap'
  | 'channel'
  | 'orchestrator'
  | 'agent'
  | 'tool'
  | 'storage'
  | 'app';

export interface LogContext {
  chatId?: string;
  messageId?: string;
  groupName?: string;
  sessionId?: string;
  toolName?: string;
  channelName?: string;
  [key: string]: unknown;
}
