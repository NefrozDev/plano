import { SwipeToDelete } from './swipe-to-delete';

describe('SwipeToDelete', () => {
  const press = (swipe: SwipeToDelete, x: number) => {
    const element = document.createElement('div');
    element.setPointerCapture = vi.fn();
    const event = new PointerEvent('pointerdown', { pointerId: 1, clientX: x });
    Object.defineProperty(event, 'currentTarget', { value: element });
    swipe.start(event);
  };
  const click = () => new MouseEvent('click', { cancelable: true });

  it('swallows the click that ends a swipe, once', () => {
    const swipe = new SwipeToDelete(() => undefined);
    press(swipe, 200);
    swipe.move(new PointerEvent('pointermove', { clientX: 180 }));
    swipe.finish();

    const ending = click();
    expect(swipe.swallowClick(ending)).toBe(true);
    expect(ending.defaultPrevented).toBe(true);
    expect(swipe.swallowClick(click())).toBe(false);
  });

  it('lets the next tap through when no click followed the swipe, as on a touch screen', () => {
    const onDelete = vi.fn();
    const swipe = new SwipeToDelete(onDelete);
    press(swipe, 200);
    swipe.move(new PointerEvent('pointermove', { clientX: 180 }));
    swipe.finish();

    press(swipe, 200);
    swipe.finish();

    const tap = click();
    expect(swipe.swallowClick(tap)).toBe(false);
    expect(tap.defaultPrevented).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
