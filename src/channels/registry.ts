import { createLayerLogger } from '../logger.js';
import type { ChannelName } from '../types.js';
import { createFeishuChannel } from './feishu/index.js';
import type { Channel, ChannelLifecycleSummary } from './types.js';

type ChannelFactory = () => Channel;

const logger = createLayerLogger('channel');

const channelFactories: Record<ChannelName, ChannelFactory> = {
  feishu: createFeishuChannel,
};

export class ChannelRegistry {
  private readonly channels = new Map<ChannelName, Channel>();

  public registerConfiguredChannels(): Channel[] {
    const registeredChannels: Channel[] = [];

    for (const [channelName, createChannel] of Object.entries(channelFactories) as Array<
      [ChannelName, ChannelFactory]
    >) {
      const channel = createChannel();

      if (!channel.isConfigured()) {
        logger.warn(
          {
            channelName,
          },
          'Channel is not configured and will not be registered',
        );
        continue;
      }

      this.channels.set(channelName, channel);
      registeredChannels.push(channel);
    }

    logger.info(
      {
        registeredChannels: registeredChannels.map((channel) => channel.name),
      },
      'Channel registry initialized',
    );

    return registeredChannels;
  }

  public async startAll(): Promise<ChannelLifecycleSummary[]> {
    if (this.channels.size === 0) {
      this.registerConfiguredChannels();
    }

    for (const channel of this.channels.values()) {
      await channel.connect();
    }

    return this.getStatuses();
  }

  public async stopAll(): Promise<ChannelLifecycleSummary[]> {
    for (const channel of this.channels.values()) {
      await channel.disconnect();
    }

    return this.getStatuses();
  }

  public get(channelName: ChannelName): Channel | undefined {
    return this.channels.get(channelName);
  }

  public getStatuses(): ChannelLifecycleSummary[] {
    return [...this.channels.values()].map((channel) => channel.getStatus());
  }
}

export const createChannelRegistry = (): ChannelRegistry => new ChannelRegistry();
