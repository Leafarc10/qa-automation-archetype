import type { DatabaseClient } from './clients/DatabaseClient.js';
import { ExampleRepository } from './repositories/example/ExampleRepository.js';

/**
 * Generic composition point injected into CustomWorld. It receives an
 * already-built DatabaseClient and composes the concrete repositories the
 * project needs with it.
 */
export class RepositoryContainer {
  readonly example: ExampleRepository;

  constructor(private readonly client: DatabaseClient) {
    this.example = new ExampleRepository(client);
  }
}
