import { AppType, Domain, LoggerLevel } from '@larksuiteoapi/node-sdk';

export const FEISHU_CHANNEL_NAME = 'feishu' as const;
export const FEISHU_MESSAGE_EVENT = 'im.message.receive_v1' as const;
export const FEISHU_DEFAULT_MESSAGE_TYPE = 'text' as const;
export const FEISHU_WS_LOGGER_LEVEL = LoggerLevel.info;
export const FEISHU_APP_TYPE = AppType.SelfBuild;

export const FEISHU_DOMAIN_MAP = {
  feishu: Domain.Feishu,
  lark: Domain.Lark,
} as const;
