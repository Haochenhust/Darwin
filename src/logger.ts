import pino, { type Logger, type LoggerOptions } from 'pino';

import { config } from './config.js';
import type { LayerName, LogContext } from './types.js';

const createPinoTransport = () => {
  if (!config.prettyLogs) {
    return undefined;
  }

  return pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      messageFormat: '[{layer}] {msg}',
      singleLine: true,
      translateTime: 'SYS:standard',
    },
  });
};

const loggerOptions: LoggerOptions = {
  name: config.appName,
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    app: config.appName,
    env: config.nodeEnv,
  },
};

export const rootLogger: Logger = pino(loggerOptions, createPinoTransport());

export const createLayerLogger = (layer: LayerName, bindings: LogContext = {}): Logger => {
  return rootLogger.child({
    layer,
    ...bindings,
  });
};
