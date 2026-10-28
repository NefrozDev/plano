import type { LiveEvent } from '@plano/common';

/** Stands in for EventSource in specs: records its URL and replays named events on demand. */
export class FakeEventSource extends EventTarget {
  /** Every source created since the last reset, oldest first. */
  static created: FakeEventSource[] = [];

  closed = false;

  constructor(readonly url: string) {
    super();
    FakeEventSource.created.push(this);
  }

  /** The last source opened: the one a signed-in app listens to. */
  static latest(): FakeEventSource | undefined {
    return FakeEventSource.created.at(-1);
  }

  /** Delivers an event the way the API names and encodes it. */
  emit(event: LiveEvent): void {
    this.dispatchEvent(new MessageEvent(event.type, { data: JSON.stringify(event) }));
  }

  close(): void {
    this.closed = true;
  }
}
