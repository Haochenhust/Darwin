import {
  Client,
  EventDispatcher,
  LoggerLevel,
  type Domain,
  type EventHandles,
  type WSClient as LarkWsClientType,
  WSClient,
} from '@larksuiteoapi/node-sdk';

import type { FeishuConfig } from '../../config.js';
import { createLayerLogger } from '../../logger.js';
import {
  FEISHU_APP_TYPE,
  FEISHU_DOMAIN_MAP,
  FEISHU_MESSAGE_EVENT,
  FEISHU_WS_LOGGER_LEVEL,
} from './constants.js';

const feishuLogger = createLayerLogger('channel', {
  channelName: 'feishu',
});

export interface FeishuClientBundle {
  apiClient: Client;
  wsClient: LarkWsClientType;
  eventDispatcher: EventDispatcher;
}

type FeishuWsDomain = (typeof FEISHU_DOMAIN_MAP)[keyof typeof FEISHU_DOMAIN_MAP];
type FeishuClientConfig = {
  appId: string;
  appSecret: string;
  appType: typeof FEISHU_APP_TYPE;
  domain: Domain;
};

const toSdkDomain = (domain: FeishuConfig['domain']): FeishuWsDomain => FEISHU_DOMAIN_MAP[domain];

const createBaseConfig = (feishuConfig: FeishuConfig): FeishuClientConfig => {
  if (!feishuConfig.appId || !feishuConfig.appSecret) {
    throw new Error('Feishu client creation requires appId and appSecret.');
  }

  return {
    appId: feishuConfig.appId,
    appSecret: feishuConfig.appSecret,
    appType: FEISHU_APP_TYPE,
    domain: toSdkDomain(feishuConfig.domain) as Domain,
  };
};

export const createFeishuClientBundle = (
  feishuConfig: FeishuConfig,
  handles: EventHandles = {},
): FeishuClientBundle => {
  const baseConfig = createBaseConfig(feishuConfig);
  const eventDispatcher = new EventDispatcher({
    encryptKey: feishuConfig.encryptKey,
    verificationToken: feishuConfig.verificationToken,
    loggerLevel: LoggerLevel.warn,
  }).register({
    [FEISHU_MESSAGE_EVENT]: async (data) => {
      feishuLogger.info(
        {
          eventType: FEISHU_MESSAGE_EVENT,
          hasMessage: Boolean(data?.message),
        },
        'Feishu event received',
      );

      const handler = handles[FEISHU_MESSAGE_EVENT];
      if (handler) {
        return handler(data);
      }

      return undefined;
    },
    ...handles,
  });

  const apiClient = new Client(baseConfig);
  const wsClient = new WSClient({
    ...baseConfig,
    loggerLevel: FEISHU_WS_LOGGER_LEVEL,
  });

  return {
    apiClient,
    wsClient,
    eventDispatcher,
  };
};
