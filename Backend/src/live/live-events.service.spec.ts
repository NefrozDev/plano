import type { MessageEvent } from '@nestjs/common';
import { LiveController } from './live.controller';
import { HEARTBEAT_MS, LiveEventsService } from './live-events.service';

describe('LiveEventsService', () => {
  let live: LiveEventsService;

  beforeEach(() => {
    live = new LiveEventsService();
  });

  afterEach(() => live.onApplicationShutdown());

  function collect(userId: string): MessageEvent[] {
    const received: MessageEvent[] = [];
    live.streamFor(userId).subscribe((event) => received.push(event));
    return received;
  }

  it('delivers an event to the streams of its recipients only', () => {
    const ada = collect('ada');
    const bob = collect('bob');
    const adaOtherTab = collect('ada');

    live.publish(['ada', 'cyd'], { type: 'list.changed', listId: 'list-1' });
    live.publish([], { type: 'list.removed', listId: 'list-2' });

    const expected = {
      type: 'list.changed',
      data: { type: 'list.changed', listId: 'list-1' },
    };
    expect(ada).toEqual([expected]);
    expect(adaOtherTab).toEqual([expected]);
    expect(bob).toEqual([]);
  });

  it('sends each event once to a user named twice', () => {
    const ada = collect('ada');

    live.publish(['ada', 'ada'], { type: 'list.removed', listId: 'list-1' });

    expect(ada).toHaveLength(1);
  });

  it('pings idle streams so proxies keep them open', () => {
    vi.useFakeTimers();
    try {
      const ada = collect('ada');

      vi.advanceTimersByTime(HEARTBEAT_MS - 1);
      expect(ada).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(ada).toEqual([{ type: 'ping', data: '' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ends every stream when the application shuts down', () => {
    let completed = 0;
    live.streamFor('ada').subscribe({ complete: () => completed++ });
    live.streamFor('bob').subscribe({ complete: () => completed++ });

    live.onApplicationShutdown();

    expect(completed).toBe(2);
  });

  it('streams the signed-in user’s events from the controller', () => {
    const streamFor = vi.spyOn(live, 'streamFor');
    const controller = new LiveController(live);

    const stream = controller.stream('ada');

    expect(streamFor).toHaveBeenCalledTimes(1);
    expect(streamFor).toHaveBeenCalledWith('ada');
    expect(stream).toBe(streamFor.mock.results[0].value);
  });
});
