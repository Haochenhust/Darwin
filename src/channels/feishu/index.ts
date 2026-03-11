import { createReadStream } from 'node:fs';
import { buffer as streamToBuffer } from 'node:stream/consumers';

import type { EventHandles } from '@larksuiteoapi/node-sdk';

import { config } from '../../config.js';
import { createLayerLogger } from '../../logger.js';
import {
  createMessageRepo,
  type MessageRecord,
  type MessageStatus,
} from '../../storage/repositories/message-repo.js';
import { getDatabase } from '../../storage/db.js';
import type { Channel, ChannelLifecycleSummary, OutboundMessage } from '../types.js';
import {
  createConfirmationCardMessage,
  createInfoDisplayCardMessage,
  createProgressStatusCardMessage,
  type FeishuConfirmationCardOptions,
  type FeishuInfoCardOptions,
  type FeishuProgressStatusCardOptions,
} from './card-builder.js';
import { createFeishuClientBundle, type FeishuClientBundle } from './client.js';
import {
  buildFeishuDebugHelpText,
  buildFeishuDebugPayloads,
  parseFeishuDebugCommand,
  resolveReplyTarget,
} from './debug-commands.js';
import { buildEchoReply, parseFeishuMessage, type FeishuMessageReceiveEvent } from './message-handler.js';
import {
  createImageMessage,
  createPostMessage,
  type FeishuPostOptions,
} from './message-builder.js';
import {
  FEISHU_CHANNEL_NAME,
  FEISHU_DEFAULT_MESSAGE_TYPE,
  FEISHU_MAIN_GROUP_NAME,
  FEISHU_MESSAGE_EVENT,
} from './constants.js';

const logger = createLayerLogger('channel', {
  channelName: FEISHU_CHANNEL_NAME,
});

const buildTextMessageContent = (text: string): string => {
  return JSON.stringify({ text });
};

type FeishuOutboundTarget = Pick<OutboundMessage, 'receiveId' | 'receiveIdType' | 'storageContext'>;

export class FeishuChannel implements Channel {
  public readonly name = FEISHU_CHANNEL_NAME;

  private bundle?: FeishuClientBundle;
  private connected = false;
  private readonly messageRepo = createMessageRepo(getDatabase().database);

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

    const response = await this.bundle.apiClient.im.message.create({
      params: {
        receive_id_type: message.receiveIdType,
      },
      data: {
        receive_id: message.receiveId,
        content: message.content,
        msg_type: message.messageType ?? FEISHU_DEFAULT_MESSAGE_TYPE,
      },
    });

    const messageId =
      typeof response?.data?.message_id === 'string' && response.data.message_id.length > 0
        ? response.data.message_id
        : null;

    this.messageRepo.insert({
      channelName: this.name,
      chatId: message.storageContext?.chatId ?? message.receiveId,
      groupName: message.storageContext?.groupName ?? null,
      direction: 'outbound',
      status: 'done',
      triggerSource: message.storageContext?.triggerSource ?? 'chat',
      messageId,
      sessionId: message.storageContext?.sessionId ?? null,
      textContent: this.extractTextPreview(message.content, message.messageType),
      rawPayload: {
        request: {
          receiveId: message.receiveId,
          receiveIdType: message.receiveIdType,
          messageType: message.messageType ?? FEISHU_DEFAULT_MESSAGE_TYPE,
          content: message.content,
        },
        response,
        sourceMessageId: message.storageContext?.sourceMessageId ?? null,
      },
    });

    logger.info(
      {
        chatId: message.storageContext?.chatId,
        groupName: message.storageContext?.groupName,
        receiveId: message.receiveId,
        receiveIdType: message.receiveIdType,
        outboundMessageId: messageId,
      },
      'Outbound Feishu message sent',
    );
  }

  public async sendInfoDisplayCard(
    target: FeishuOutboundTarget,
    card: FeishuInfoCardOptions,
  ): Promise<void> {
    await this.sendMessage(
      createInfoDisplayCardMessage({
        ...target,
        card,
      }),
    );
  }

  public async sendConfirmationCard(
    target: FeishuOutboundTarget,
    card: FeishuConfirmationCardOptions,
  ): Promise<void> {
    await this.sendMessage(
      createConfirmationCardMessage({
        ...target,
        card,
      }),
    );
  }

  public async sendProgressStatusCard(
    target: FeishuOutboundTarget,
    card: FeishuProgressStatusCardOptions,
  ): Promise<void> {
    await this.sendMessage(
      createProgressStatusCardMessage({
        ...target,
        card,
      }),
    );
  }

  public async uploadMessageImage(image: Buffer | ReturnType<typeof createReadStream>): Promise<string> {
    if (!this.bundle) {
      throw new Error('Feishu channel is not connected.');
    }

    const result = await this.bundle.apiClient.im.image.create({
      data: {
        image_type: 'message',
        image,
      },
    });

    if (!result?.image_key) {
      throw new Error('Feishu image upload did not return an image_key.');
    }

    logger.info(
      {
        imageKey: result.image_key,
      },
      'Feishu image uploaded',
    );

    return result.image_key;
  }

  public async cloneInboundImage(messageId: string, fileKey: string): Promise<string> {
    if (!this.bundle) {
      throw new Error('Feishu channel is not connected.');
    }

    const resource = await this.bundle.apiClient.im.messageResource.get({
      params: {
        type: 'image',
      },
      path: {
        message_id: messageId,
        file_key: fileKey,
      },
    });

    const imageBuffer = (await streamToBuffer(resource.getReadableStream())) as Buffer;
    const uploadedImageKey = await this.uploadMessageImage(imageBuffer);

    logger.info(
      {
        sourceMessageId: messageId,
        sourceImageKey: fileKey,
        uploadedImageKey,
      },
      'Inbound Feishu image cloned',
    );

    return uploadedImageKey;
  }

  public async sendImage(
    target: FeishuOutboundTarget,
    options: { imageKey: string } | { filePath: string },
  ): Promise<void> {
    const imageKey =
      'imageKey' in options
        ? options.imageKey
        : await this.uploadMessageImage(createReadStream(options.filePath));

    await this.sendMessage(
      createImageMessage({
        ...target,
        imageKey,
      }),
    );
  }

  public async sendPost(
    target: FeishuOutboundTarget,
    post: FeishuPostOptions,
  ): Promise<void> {
    await this.sendMessage(
      createPostMessage({
        ...target,
        post,
      }),
    );
  }

  private createEventHandles(): EventHandles {
    return {
      [FEISHU_MESSAGE_EVENT]: async (event: FeishuMessageReceiveEvent) => {
        const parsedMessage = parseFeishuMessage(event);
        const inboundRecord = this.persistInboundMessage(event, parsedMessage);
        const messageLogger = logger.child({
          chatId: parsedMessage.chatId,
          messageId: parsedMessage.messageId,
          groupName: FEISHU_MAIN_GROUP_NAME,
        });

        messageLogger.info(
          {
            chatType: parsedMessage.chatType,
            messageType: parsedMessage.messageType,
            text: parsedMessage.text,
            imageKey: parsedMessage.imageKey,
          },
          'Inbound Feishu message parsed',
        );

        if (!inboundRecord) {
          messageLogger.info(
            {
              eventId: parsedMessage.eventId,
            },
            'Inbound Feishu message skipped because it is already persisted',
          );
          return;
        }

        if (!parsedMessage.shouldProcess) {
          this.messageRepo.markDone(inboundRecord.id);
          messageLogger.info(
            {
              reason: parsedMessage.ignoreReason,
            },
            'Inbound Feishu message skipped',
          );
          return;
        }

        this.messageRepo.markProcessing(inboundRecord.id);

        const replyTarget = resolveReplyTarget({
          receiveId: parsedMessage.senderOpenId ?? parsedMessage.senderUserId ?? parsedMessage.chatId,
          receiveIdType: parsedMessage.senderOpenId
            ? 'open_id'
            : parsedMessage.senderUserId
              ? 'user_id'
              : 'chat_id',
        });

        const outboundContext = {
          chatId: parsedMessage.chatId,
          groupName: FEISHU_MAIN_GROUP_NAME,
          sourceMessageId: parsedMessage.messageId,
        };

        try {
          const debugCommand = parsedMessage.text
            ? parseFeishuDebugCommand(parsedMessage.text)
            : null;

          if (debugCommand) {
            const debugPayloads = buildFeishuDebugPayloads();

            switch (debugCommand.name) {
              case 'card-info':
                await this.sendInfoDisplayCard(
                  { ...replyTarget, storageContext: outboundContext },
                  debugPayloads.infoCard,
                );
                messageLogger.info({ command: debugCommand.name }, 'Debug command handled');
                this.messageRepo.markDone(inboundRecord.id);
                return;
              case 'card-confirm':
                await this.sendConfirmationCard(
                  { ...replyTarget, storageContext: outboundContext },
                  debugPayloads.confirmationCard,
                );
                messageLogger.info({ command: debugCommand.name }, 'Debug command handled');
                this.messageRepo.markDone(inboundRecord.id);
                return;
              case 'card-progress':
                await this.sendProgressStatusCard(
                  { ...replyTarget, storageContext: outboundContext },
                  debugPayloads.progressCard,
                );
                messageLogger.info({ command: debugCommand.name }, 'Debug command handled');
                this.messageRepo.markDone(inboundRecord.id);
                return;
              case 'post':
                await this.sendPost(
                  { ...replyTarget, storageContext: outboundContext },
                  debugPayloads.post,
                );
                messageLogger.info({ command: debugCommand.name }, 'Debug command handled');
                this.messageRepo.markDone(inboundRecord.id);
                return;
              case 'image':
                if (debugCommand.args[0]) {
                  await this.sendImage(
                    { ...replyTarget, storageContext: outboundContext },
                    {
                      imageKey: debugCommand.args[0],
                    },
                  );
                } else {
                  await this.sendMessage({
                    ...replyTarget,
                    content: buildTextMessageContent('Usage: /test image <image_key>'),
                    messageType: FEISHU_DEFAULT_MESSAGE_TYPE,
                    storageContext: outboundContext,
                  });
                }
                messageLogger.info(
                  { command: debugCommand.name, args: debugCommand.args },
                  'Debug command handled',
                );
                this.messageRepo.markDone(inboundRecord.id);
                return;
              case 'help':
              default:
                await this.sendMessage({
                  ...replyTarget,
                  content: buildTextMessageContent(buildFeishuDebugHelpText()),
                  messageType: FEISHU_DEFAULT_MESSAGE_TYPE,
                  storageContext: outboundContext,
                });
                messageLogger.info({ command: debugCommand.name }, 'Debug command handled');
                this.messageRepo.markDone(inboundRecord.id);
                return;
            }
          }

          if (parsedMessage.messageType === 'image' && parsedMessage.imageKey) {
            const echoedImageKey = await this.cloneInboundImage(
              parsedMessage.messageId,
              parsedMessage.imageKey,
            );

            await this.sendImage(
              { ...replyTarget, storageContext: outboundContext },
              {
                imageKey: echoedImageKey,
              },
            );

            messageLogger.info(
              {
                sourceImageKey: parsedMessage.imageKey,
                echoedImageKey,
              },
              'Image echo sent',
            );
            this.messageRepo.markDone(inboundRecord.id);
            return;
          }

          await this.sendMessage({
            ...replyTarget,
            content: buildEchoReply(parsedMessage),
            messageType: FEISHU_DEFAULT_MESSAGE_TYPE,
            storageContext: outboundContext,
          });

          messageLogger.info(
            {
              echoText: parsedMessage.text,
            },
            'Echo reply sent',
          );
          this.messageRepo.markDone(inboundRecord.id);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.messageRepo.markFailed(inboundRecord.id, errorMessage);
          messageLogger.error({ error }, 'Failed to handle inbound Feishu message');
          throw error;
        }
      },
    };
  }

  private persistInboundMessage(
    event: FeishuMessageReceiveEvent,
    parsedMessage: ReturnType<typeof parseFeishuMessage>,
  ): MessageRecord | null {
    if (parsedMessage.eventId) {
      const existingRecord = this.messageRepo.findByEventId(this.name, parsedMessage.eventId);

      if (existingRecord) {
        return null;
      }
    }

    return this.messageRepo.insert({
      channelName: this.name,
      chatId: parsedMessage.chatId,
      groupName: FEISHU_MAIN_GROUP_NAME,
      direction: 'inbound',
      status: 'received',
      triggerSource: 'chat',
      eventId: parsedMessage.eventId ?? null,
      messageId: parsedMessage.messageId,
      senderId: parsedMessage.senderOpenId ?? parsedMessage.senderUserId ?? null,
      messageType: parsedMessage.messageType,
      threadRootId: event.message.root_id ?? null,
      parentId: event.message.parent_id ?? null,
      textContent: parsedMessage.text ?? parsedMessage.imageKey ?? null,
      rawPayload: event,
      errorMessage: parsedMessage.shouldProcess ? null : parsedMessage.ignoreReason ?? null,
    });
  }

  private extractTextPreview(content: string, messageType?: OutboundMessage['messageType']): string | null {
    if (messageType && messageType !== 'text') {
      return null;
    }

    try {
      const parsedContent = JSON.parse(content) as { text?: unknown };
      return typeof parsedContent.text === 'string' ? parsedContent.text : null;
    } catch {
      return null;
    }
  }
}

export const createFeishuChannel = (): Channel => new FeishuChannel();
