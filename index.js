// -----------------------------------------------------------------------------
// Entry point of the HP Printer integration for Gladys Assistant.
//
// This file only wires the SDK to the printer fleet (src/printer/fleet.js):
//   1. instantiates the SDK (connection, auth, reconnection: handled by it);
//   2. registers every handler BEFORE connect();
//   3. connects, finds the printers, reads them and publishes them.
//
// The Gladys supervisor injects GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN
// and GLADYS_INTEGRATION_SELECTOR: `new GladysIntegration()` reads them.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const gladys = new GladysIntegration();
const { fleet } = createApp(gladys);

// The SDK disconnects cleanly and exits with code 0 on SIGTERM/SIGINT; the
// reads under way finish first, so /data keeps what they learned.
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  await fleet.settle();
});

logger.info('Starting the HP Printer integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
