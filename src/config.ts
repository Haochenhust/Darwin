import 'dotenv/config';

import pino from 'pino';

export interface FeishuConfig {
  enabled: boolean;
  appId?: string;
  appSecret?: string;
  domain: 'feishu' | 'lark';
  encryptKey?: string;
  verificationToken?: string;
}

export interface AppConfig {
  appName: string;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: pino.LevelWithSilent;
  prettyLogs: boolean;
  heartbeatIntervalMs: number;
  feishu: FeishuConfig;
}

const parseNodeEnv = (value: string | undefined): AppConfig['nodeEnv'] => {
  if (value === 'production' || value === 'test') {
    return value;
  }

  return 'development';
};

const parseLogLevel = (value: string | undefined): AppConfig['logLevel'] => {
  const supportedLevels = new Set<pino.LevelWithSilent>([
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
  ]);

  return supportedLevels.has(value as pino.LevelWithSilent)
    ? (value as pino.LevelWithSilent)
    : 'info';
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
};

const nodeEnv = parseNodeEnv(process.env.NODE_ENV);
const feishuAppId = process.env.FEISHU_APP_ID?.trim();
const feishuAppSecret = process.env.FEISHU_APP_SECRET?.trim();
const feishuHasAnyCredential = Boolean(feishuAppId || feishuAppSecret);
const feishuIsFullyConfigured = Boolean(feishuAppId && feishuAppSecret);

if (feishuHasAnyCredential && !feishuIsFullyConfigured) {
  throw new Error('FEISHU_APP_ID and FEISHU_APP_SECRET must be set together.');
}

export const config: AppConfig = {
  appName: process.env.APP_NAME?.trim() || 'darwin',
  nodeEnv,
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
  prettyLogs: parseBoolean(process.env.LOG_PRETTY, nodeEnv !== 'production'),
  heartbeatIntervalMs: parsePositiveInteger(process.env.HEARTBEAT_INTERVAL_MS, 300_000),
  feishu: {
    enabled: feishuIsFullyConfigured,
    appId: feishuAppId,
    appSecret: feishuAppSecret,
    domain: process.env.FEISHU_DOMAIN?.trim().toLowerCase() === 'lark' ? 'lark' : 'feishu',
    encryptKey: process.env.FEISHU_ENCRYPT_KEY?.trim() || undefined,
    verificationToken: process.env.FEISHU_VERIFICATION_TOKEN?.trim() || undefined,
  },
};
