/**
 * infra/push/noop.notifier.ts — No-op implementation of PushNotifier.
 * DOC2 §2.7.1, DOC3 §3.12, DOC3 §3.20.
 */

import type { PushNotifier } from '../../core/ports';

export class NoopNotifier implements PushNotifier {
  async send(_userId: string, _payload: { title: string; body: string; url?: string }): Promise<void> {
    void _userId;
    void _payload;
    // No-op for dev/demo or before VAPID keys are configured
  }
}
