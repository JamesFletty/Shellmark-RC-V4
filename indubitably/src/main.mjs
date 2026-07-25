import { FileArtifactStore } from './infrastructure/artifact-store.mjs';
import { FileEventStore } from './infrastructure/event-store.mjs';
import { FileNonceStore } from './infrastructure/nonce-store.mjs';
import { MarketplaceService } from './domain/marketplace-service.mjs';
import { PlatformSigner } from './domain/receipts.mjs';
import { RequestAuthenticator } from './api/request-auth.mjs';
import { createApiServer } from './api/server.mjs';
import { loadConfig } from './config.mjs';
import { ValidatorRegistry } from './validators/validator-registry.mjs';
import { JsonArtifactValidator } from './validators/json-artifact-validator.mjs';
import { DockerCommandValidator } from './validators/docker-command-validator.mjs';

const config = loadConfig();
const signer = await PlatformSigner.fromPemFile(config.signingKeyPath);
const eventStore = new FileEventStore(config.eventLogPath);
const artifactStore = new FileArtifactStore(config.artifactDir, { maximumBytes: config.maximumArtifactBytes });
const service = await new MarketplaceService({ eventStore, artifactStore, signer }).initialize();
const nonceStore = new FileNonceStore(config.noncePath);
const authenticator = new RequestAuthenticator({ service, nonceStore, adminToken: config.adminToken });
const validators = new ValidatorRegistry()
  .register(new JsonArtifactValidator({ artifactStore }))
  .register(new DockerCommandValidator({ workspaceRoot: config.validatorWorkspaceRoot }));
const server = createApiServer({ service, authenticator, validators, signer, maximumBodyBytes: config.maximumBodyBytes });

server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({
    level: 'info',
    event: 'server.started',
    host: config.host,
    port: config.port,
    phase: 0,
    event_count: service.projection.events.length
  }));
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
