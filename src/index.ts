import { config } from './config.js';
import { createLayerLogger } from './logger.js';

const bootstrapLogger = createLayerLogger('bootstrap');
const channelLogger = createLayerLogger('channel', {
  channelName: 'feishu',
});
const orchestratorLogger = createLayerLogger('orchestrator');
const agentLogger = createLayerLogger('agent');
const toolLogger = createLayerLogger('tool');
const appLogger = createLayerLogger('app');

bootstrapLogger.info(
  {
    nodeEnv: config.nodeEnv,
    logLevel: config.logLevel,
    prettyLogs: config.prettyLogs,
  },
  'Darwin runtime booting',
);

channelLogger.info(
  {
    connected: false,
  },
  'Channel layer initialized',
);

orchestratorLogger.info(
  {
    schedulerEnabled: false,
  },
  'Orchestrator layer initialized',
);

agentLogger.info(
  {
    sessionActive: false,
  },
  'Agent layer initialized',
);

toolLogger.info(
  {
    registeredTools: 0,
  },
  'Tool layer initialized',
);

appLogger.info(
  {
    heartbeatIntervalMs: config.heartbeatIntervalMs,
  },
  'Darwin startup complete',
);

const heartbeat = setInterval(() => {
  appLogger.debug(
    {
      uptimeSeconds: Math.floor(process.uptime()),
    },
    'Darwin heartbeat',
  );
}, config.heartbeatIntervalMs);

const shutdown = (signal: NodeJS.Signals) => {
  clearInterval(heartbeat);
  bootstrapLogger.info({ signal }, 'Darwin shutting down');
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
