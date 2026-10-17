/**
 * container.ts — composition root (empty for Step 2).
 * ALL concrete class construction and wiring happens here.
 * Services receive ports via constructor injection; no DI framework.
 * DOC3 §3.1: only container.ts constructs concrete classes.
 */
import { SwitchableClock } from './infra/clock';
import { EventBus } from './infra/event-bus';

export interface Container {
  clock: SwitchableClock;
  eventBus: EventBus;
}

export function buildContainer(): Container {
  const clock = new SwitchableClock();
  const eventBus = new EventBus();

  return { clock, eventBus };
}
