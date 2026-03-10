import type { EventHandles } from '@larksuiteoapi/node-sdk';

import {
  FEISHU_GROUP_CHAT_TYPES,
  FEISHU_PRIVATE_CHAT_TYPES,
  FEISHU_TEXT_MESSAGE_TYPE,
} from './constants.js';

type FeishuMessageReceiveHandler = NonNullable<EventHandles['im.message.receive_v1']>;
export type FeishuMessageReceiveEvent = Parameters<FeishuMessageReceiveHandler>[0];

export interface ParsedFeishuMessage {
  eventId?: string;
  messageId: string;
  chatId: string;
  chatType: string;
  messageType: string;
  senderOpenId?: string;
  senderUserId?: string;
  text?: string;
  shouldProcess: boolean;
  ignoreReason?: string;
}

const normalizeText = (value: string | undefined): string | undefined => {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : undefined;
};

const parseTextContent = (rawContent: string): string | undefined => {
  try {
    const parsedContent = JSON.parse(rawContent) as {
      text?: string;
    };

    return normalizeText(parsedContent.text);
  } catch {
    return undefined;
  }
};

export const parseFeishuMessage = (
  event: FeishuMessageReceiveEvent,
): ParsedFeishuMessage => {
  const messageText =
    event.message.message_type === FEISHU_TEXT_MESSAGE_TYPE
      ? parseTextContent(event.message.content)
      : undefined;

  if (!FEISHU_PRIVATE_CHAT_TYPES.has(event.message.chat_type)) {
    return {
      eventId: event.event_id,
      messageId: event.message.message_id,
      chatId: event.message.chat_id,
      chatType: event.message.chat_type,
      messageType: event.message.message_type,
      senderOpenId: event.sender.sender_id?.open_id,
      senderUserId: event.sender.sender_id?.user_id,
      text: messageText,
      shouldProcess: false,
      ignoreReason: FEISHU_GROUP_CHAT_TYPES.has(event.message.chat_type)
        ? 'group_chat_not_supported_yet'
        : 'unsupported_chat_type',
    };
  }

  if (event.message.message_type !== FEISHU_TEXT_MESSAGE_TYPE) {
    return {
      eventId: event.event_id,
      messageId: event.message.message_id,
      chatId: event.message.chat_id,
      chatType: event.message.chat_type,
      messageType: event.message.message_type,
      senderOpenId: event.sender.sender_id?.open_id,
      senderUserId: event.sender.sender_id?.user_id,
      shouldProcess: false,
      ignoreReason: 'unsupported_message_type',
    };
  }

  if (!messageText) {
    return {
      eventId: event.event_id,
      messageId: event.message.message_id,
      chatId: event.message.chat_id,
      chatType: event.message.chat_type,
      messageType: event.message.message_type,
      senderOpenId: event.sender.sender_id?.open_id,
      senderUserId: event.sender.sender_id?.user_id,
      shouldProcess: false,
      ignoreReason: 'empty_text_message',
    };
  }

  return {
    eventId: event.event_id,
    messageId: event.message.message_id,
    chatId: event.message.chat_id,
    chatType: event.message.chat_type,
    messageType: event.message.message_type,
    senderOpenId: event.sender.sender_id?.open_id,
    senderUserId: event.sender.sender_id?.user_id,
    text: messageText,
    shouldProcess: true,
  };
};

export const buildEchoReply = (message: ParsedFeishuMessage): string => {
  return JSON.stringify({
    text: message.text ?? '',
  });
};
