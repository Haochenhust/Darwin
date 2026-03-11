import { createReadStream } from 'node:fs';
import { buffer as streamToBuffer } from 'node:stream/consumers';

import type { EventHandles } from '@larksuiteoapi/node-sdk';

import { config } from '../../config.js';
import { createLayerLogger } from '../../logger.js';
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
  FEISHU_MESSAGE_EVENT,
} from './constants.js';

const logger = createLayerLogger('channel', {
  channelName: FEISHU_CHANNEL_NAME,
});

const buildTextMessageContent = (text: string): string => {
  return JSON.stringify({ text });
};

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

  public async sendInfoDisplayCard(
    target: Pick<OutboundMessage, 'receiveId' | 'receiveIdType'>,
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
    target: Pick<OutboundMessage, 'receiveId' | 'receiveIdType'>,
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
    target: Pick<OutboundMessage, 'receiveId' | 'receiveIdType'>,
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
    target: Pick<OutboundMessage, 'receiveId' | 'receiveIdType'>,
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
    target: Pick<OutboundMessage, 'receiveId' | 'receiveIdType'>,
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
        const messageLogger = logger.child({
          chatId: parsedMessage.chatId,
          messageId: parsedMessage.messageId,
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

        if (!parsedMessage.shouldProcess) {
          messageLogger.info(
            {
              reason: parsedMessage.ignoreReason,
            },
            'Inbound Feishu message skipped',
          );
          return;
        }

        const replyTarget = resolveReplyTarget({
          receiveId: parsedMessage.senderOpenId ?? parsedMessage.senderUserId ?? parsedMessage.chatId,
          receiveIdType: parsedMessage.senderOpenId
            ? 'open_id'
            : parsedMessage.senderUserId
              ? 'user_id'
              : 'chat_id',
        });

        const debugCommand = parsedMessage.text
          ? parseFeishuDebugCommand(parsedMessage.text)
          : null;

        if (debugCommand) {
          const debugPayloads = buildFeishuDebugPayloads();

          switch (debugCommand.name) {
            case 'card-info':
              await this.sendInfoDisplayCard(replyTarget, debugPayloads.infoCard);
              messageLogger.info({ command: debugCommand.name }, 'Debug command handled');
              return;
            case 'card-confirm':
              await this.sendConfirmationCard(replyTarget, debugPayloads.confirmationCard);
              messageLogger.info({ command: debugCommand.name }, 'Debug command handled');
              return;
            case 'card-progress':
              await this.sendProgressStatusCard(replyTarget, debugPayloads.progressCard);
              messageLogger.info({ command: debugCommand.name }, 'Debug command handled');
              return;
            case 'post':
              await this.sendPost(replyTarget, debugPayloads.post);
              messageLogger.info({ command: debugCommand.name }, 'Debug command handled');
              return;
            case 'image':
              if (debugCommand.args[0]) {
                await this.sendImage(replyTarget, {
                  imageKey: debugCommand.args[0],
                });
              } else {
                await this.sendMessage({
                  ...replyTarget,
                  content: buildTextMessageContent(
                    'Usage: /test image <image_key>',
                  ),
                  messageType: FEISHU_DEFAULT_MESSAGE_TYPE,
                });
              }
              messageLogger.info(
                { command: debugCommand.name, args: debugCommand.args },
                'Debug command handled',
              );
              return;
            case 'help':
            default:
              await this.sendMessage({
                ...replyTarget,
                content: buildTextMessageContent(buildFeishuDebugHelpText()),
                messageType: FEISHU_DEFAULT_MESSAGE_TYPE,
              });
              messageLogger.info({ command: debugCommand.name }, 'Debug command handled');
              return;
          }
        }

        if (parsedMessage.messageType === 'image' && parsedMessage.imageKey) {
          const echoedImageKey = await this.cloneInboundImage(
            parsedMessage.messageId,
            parsedMessage.imageKey,
          );

          await this.sendImage(replyTarget, {
            imageKey: echoedImageKey,
          });

          messageLogger.info(
            {
              sourceImageKey: parsedMessage.imageKey,
              echoedImageKey,
            },
            'Image echo sent',
          );
          return;
        }

        await this.sendMessage({
          ...replyTarget,
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
