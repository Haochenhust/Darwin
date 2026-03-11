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
  imageKey?: string;
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

const parseImageContent = (rawContent: string): string | undefined => {
  try {
    const parsedContent = JSON.parse(rawContent) as {
      image_key?: string;
    };

    const imageKey = parsedContent.image_key?.trim();
    return imageKey || undefined;
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
  const imageKey =
    event.message.message_type === 'image'
      ? parseImageContent(event.message.content)
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
      imageKey,
      shouldProcess: false,
      ignoreReason: FEISHU_GROUP_CHAT_TYPES.has(event.message.chat_type)
        ? 'group_chat_not_supported_yet'
        : 'unsupported_chat_type',
    };
  }

  if (event.message.message_type !== FEISHU_TEXT_MESSAGE_TYPE && event.message.message_type !== 'image') {
    return {
      eventId: event.event_id,
      messageId: event.message.message_id,
      chatId: event.message.chat_id,
      chatType: event.message.chat_type,
      messageType: event.message.message_type,
      senderOpenId: event.sender.sender_id?.open_id,
      senderUserId: event.sender.sender_id?.user_id,
      imageKey,
      shouldProcess: false,
      ignoreReason: 'unsupported_message_type',
    };
  }

  if (event.message.message_type === FEISHU_TEXT_MESSAGE_TYPE && !messageText) {
    return {
      eventId: event.event_id,
      messageId: event.message.message_id,
      chatId: event.message.chat_id,
      chatType: event.message.chat_type,
      messageType: event.message.message_type,
      senderOpenId: event.sender.sender_id?.open_id,
      senderUserId: event.sender.sender_id?.user_id,
      imageKey,
      shouldProcess: false,
      ignoreReason: 'empty_text_message',
    };
  }

  if (event.message.message_type === 'image' && !imageKey) {
    return {
      eventId: event.event_id,
      messageId: event.message.message_id,
      chatId: event.message.chat_id,
      chatType: event.message.chat_type,
      messageType: event.message.message_type,
      senderOpenId: event.sender.sender_id?.open_id,
      senderUserId: event.sender.sender_id?.user_id,
      shouldProcess: false,
      ignoreReason: 'missing_image_key',
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
    imageKey,
    shouldProcess: true,
  };
};

export const buildEchoReply = (message: ParsedFeishuMessage): string => {
  return JSON.stringify({
    text: message.text ?? '',
  });
};
