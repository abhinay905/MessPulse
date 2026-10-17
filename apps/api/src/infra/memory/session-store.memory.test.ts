import { describe } from 'vitest';
import { runSessionStoreContractTests } from '../../testing/session-store.contract';
import { InMemorySessionStore } from './session-store.memory';

describe('InMemorySessionStore (Contract Implementation)', () => {
  runSessionStoreContractTests(() => new InMemorySessionStore());
});
