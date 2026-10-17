/**
 * infra/event-bus.ts — typed internal event bus.
 * Handlers are isolated: one throwing must not stop others.
 * DOC3 §3.1 / DOC2 §2.5 modularity.
 */
import { logger } from './logger';
import type { StatusSnapshot, AlertDTO } from '@messpulse/shared';

// ─── Event catalogue ─────────────────────────────────────────────────────────

export interface EventPayloadMap {
  'reading.recorded': { messId: string; mealId: string | null; seq: number; count: number; inCountDelta: number };
  'session.started': { messId: string; mealId: string; sessionId: string; userId: string };
  'session.ended': { messId: string; mealId: string; sessionId: string; reason: 'early' | 'expired' };
  'status.updated': StatusSnapshot;
  'alert.raised': AlertDTO;
  'alert.cleared': { id: string; mealId: string; ruleId: string; clearedAt: number };
  'settings.changed': { messId: string; updatedAt: number };
}

export type EventName = keyof EventPayloadMap;
type Handler<K extends EventName> = (payload: EventPayloadMap[K]) => void | Promise<void>;
type Unsubscribe = () => void;

// ─── EventBus ────────────────────────────────────────────────────────────────

export class EventBus {
  private readonly handlers = new Map<EventName, Set<Handler<EventName>>>();

  publish<K extends EventName>(event: K, payload: EventPayloadMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      // Isolate each handler — a throwing handler must not stop others.
      Promise.resolve()
        .then(() => handler(payload as EventPayloadMap[EventName]))
        .catch((err: unknown) => {
          logger.error({ event, err }, `EventBus handler error [${event}]`);
        });
    }
  }

  subscribe<K extends EventName>(event: K, handler: Handler<K>): Unsubscribe {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.handlers.get(event)!.add(handler as Handler<EventName>);
    return () => {
      this.handlers.get(event)?.delete(handler as Handler<EventName>);
    };
  }
}
