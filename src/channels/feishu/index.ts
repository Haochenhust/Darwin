import type { EventHandles } from '@larksuiteoapi/node-sdk';

import { config } from '../../config.js';
import { createLayerLogger } from '../../logger.js';
import type { Channel, ChannelLifecycleSummary, OutboundMessage } from '../types.js';
import { createFeishuClientBundle, type FeishuClientBundle } from './client.js';
import { buildEchoReply, parseFeishuMessage, type FeishuMessageReceiveEvent } from './message-handler.js';
import {
  FEISHU_CHANNEL_NAME,
  FEISHU_DEFAULT_MESSAGE_TYPE,
  FEISHU_MESSAGE_EVENT,
} from './constants.js';

const logger = createLayerLogger('channel', {
  channelName: FEISHU_CHANNEL_NAME,
});

export class FeishuChannel implements Channel {
  public readonly name = FEISHU_CHANNEL_NAME;

  private bundle?: FeishuClientBundle;
  private connected = false;

  public isConfigured(): boolean {
    return config.feishu.enabled;
  }

  public getStatus(): ChannelLifecycleSummary {
    return {
      name: this.name,
      connected: this.connected,
      configured: this.isConfigured(),
    };
  }

  public async connect(): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn('Feishu credentials are missing; channel startup skipped');
      return;
    }

    if (this.connected) {
      logger.debug('Feishu channel connect skipped because it is already connected');
      return;
    }

    this.bundle = createFeishuClientBundle(config.feishu, this.createEventHandles());
    await this.bundle.wsClient.start({
      eventDispatcher: this.bundle.eventDispatcher,
    });

    this.connected = true;
    logger.info('WebSocket connected');
  }

  public async disconnect(): Promise<void> {
    if (!this.bundle) {
      logger.debug('Feishu channel disconnect skipped because no client bundle exists');
      return;
    }

    this.bundle.wsClient.close();
    this.connected = false;
    logger.info('WebSocket disconnected');
  }

  public async sendMessage(message: OutboundMessage): Promise<void> {
    if (!this.bundle) {
      throw new Error('Feishu channel is not connected.');
    }

    await this.bundle.apiClient.im.message.create({
      params: {
        receive_id_type: message.receiveIdType,
      },
      data: {
        receive_id: message.receiveId,
        content: message.content,
        msg_type: message.messageType ?? FEISHU_DEFAULT_MESSAGE_TYPE,
      },
    });

    logger.info(
      {
        receiveId: message.receiveId,
        receiveIdType: message.receiveIdType,
      },
      'Outbound Feishu message sent',
    );
  }

  private createEventHandles(): EventHandles {
    return {
      [FEISHU_MESSAGE_EVENT]: async (event: FeishuMessageReceiveEvent) => {
        const parsedMessage = parseFeishuMessage(event);
        const messageLogger = logger.child({
          chatId: parsedMessage.chatId,
          messageId: parsedMessage.messageId,
        });

        messageLogger.info(
          {
            chatType: parsedMessage.chatType,
            messageType: parsedMessage.messageType,
            text: parsedMessage.text,
          },
          'Inbound Feishu message parsed',
        );

        if (!parsedMessage.shouldProcess) {
          messageLogger.info(
            {
              reason: parsedMessage.ignoreReason,
            },
            'Inbound Feishu message skipped',
          );
          return;
        }

        await this.sendMessage({
          receiveId: parsedMessage.senderOpenId ?? parsedMessage.senderUserId ?? parsedMessage.chatId,
          receiveIdType: parsedMessage.senderOpenId
            ? 'open_id'
            : parsedMessage.senderUserId
              ? 'user_id'
              : 'chat_id',
          content: buildEchoReply(parsedMessage),
          messageType: FEISHU_DEFAULT_MESSAGE_TYPE,
        });

        messageLogger.info(
          {
            echoText: parsedMessage.text,
          },
          'Echo reply sent',
        );
      },
    };
  }
}

export const createFeishuChannel = (): Channel => new FeishuChannel();
