import { config } from './config.js';
import { createChannelRegistry } from './channels/registry.js';
import { createLayerLogger } from './logger.js';
import { closeDatabase, getDatabase } from './storage/db.js';

const bootstrapLogger = createLayerLogger('bootstrap');
const orchestratorLogger = createLayerLogger('orchestrator');
const agentLogger = createLayerLogger('agent');
const toolLogger = createLayerLogger('tool');
const appLogger = createLayerLogger('app');
const storage = getDatabase();
const channelRegistry = createChannelRegistry();

const appliedMigrations = storage.runMigrations();

bootstrapLogger.info(
  {
    nodeEnv: config.nodeEnv,
    logLevel: config.logLevel,
    prettyLogs: config.prettyLogs,
    databasePath: storage.databasePath,
    appliedMigrations,
  },
  'Darwin runtime booting',
);

const channelStatuses = await channelRegistry.startAll();

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
    channels: channelStatuses,
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

const shutdown = async (signal: NodeJS.Signals) => {
  clearInterval(heartbeat);
  const stoppedChannels = await channelRegistry.stopAll();
  closeDatabase();
  bootstrapLogger.info({ signal, channels: stoppedChannels }, 'Darwin shutting down');
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
