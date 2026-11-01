import type { Objective } from './entities/objective.entity';
import {
  ObjectiveTree,
  displayPercent,
  type TreeFacts,
} from './objective-tree';

const NO_FACTS: TreeFacts = { doneSessions: [], checkIns: [] };

function node(id: string, changes: Partial<Objective> = {}): Objective {
  return {
    id,
    rootId: 'root',
    parentId: 'root',
    ownerId: 'ada',
    title: id,
    completion: 'none',
    metricUnit: null,
    metricTarget: null,
    metricAggregation: null,
    habitTargetDays: null,
    manualProgress: 0,
    weight: 1,
    position: 0,
    status: 'active',
    archived: false,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    ...changes,
  } as Objective;
}

const root = (changes: Partial<Objective> = {}) =>
  node('root', { parentId: null, completion: 'children', ...changes });

describe('displayPercent', () => {
  it('only shows 100 for what is complete', () => {
    expect(displayPercent(0)).toBe(0);
    expect(displayPercent(49.5)).toBe(50);
    expect(displayPercent(99.7)).toBe(99);
    expect(displayPercent(100)).toBe(100);
  });
});

describe('ObjectiveTree', () => {
  describe('structure', () => {
    const tree = new ObjectiveTree(
      [
        root(),
        node('b', { position: 1 }),
        node('a', { position: 0 }),
        node('a1', { parentId: 'a' }),
        node('a1x', { parentId: 'a1' }),
      ],
      NO_FACTS,
    );

    it('finds the top of the tree', () => {
      expect(tree.root.id).toBe('root');
    });

    it('orders children by position', () => {
      expect(tree.childrenOf('root').map(({ id }) => id)).toEqual(['a', 'b']);
      expect(tree.childrenOf('a1x')).toEqual([]);
    });

    it('walks up from the top down to the parent, without the node', () => {
      expect(tree.ancestorsOf('a1x').map(({ id }) => id)).toEqual([
        'root',
        'a',
        'a1',
      ]);
      expect(tree.ancestorsOf('root')).toEqual([]);
    });

    it('walks down at any depth', () => {
      expect(tree.descendantsOf('root').map(({ id }) => id)).toEqual([
        'a',
        'a1',
        'a1x',
        'b',
      ]);
      expect(tree.descendantsOf('b')).toEqual([]);
    });

    it('counts levels from 1', () => {
      expect(tree.levelOf('root')).toBe(1);
      expect(tree.levelOf('a1x')).toBe(4);
    });

    it('refuses a tree without a top', () => {
      expect(() => new ObjectiveTree([node('a')], NO_FACTS)).toThrow();
    });

    it('breaks position ties by age', () => {
      const ties = new ObjectiveTree(
        [
          root(),
          node('late', { createdAt: new Date('2026-10-02T00:00:00Z') }),
          node('early', { createdAt: new Date('2026-10-01T00:00:00Z') }),
        ],
        NO_FACTS,
      );
      expect(ties.childrenOf('root').map(({ id }) => id)).toEqual([
        'early',
        'late',
      ]);
    });
  });

  describe('progress', () => {
    it('has no bar for `none`', () => {
      const tree = new ObjectiveTree([root({ completion: 'none' })], NO_FACTS);
      expect(tree.percent('root')).toBeNull();
      expect(tree.amount('root')).toBeNull();
    });

    it('answers null for an unknown node', () => {
      const tree = new ObjectiveTree([root()], NO_FACTS);
      expect(tree.percent('nope')).toBeNull();
      expect(tree.amount('nope')).toBeNull();
    });

    it('uses the percentage set by hand for `manual`', () => {
      const tree = new ObjectiveTree(
        [root({ completion: 'manual', manualProgress: 40 })],
        NO_FACTS,
      );
      expect(tree.percent('root')).toBe(40);
    });

    describe('metric', () => {
      const metric = (aggregation: 'sum' | 'max', target = 10) =>
        root({
          completion: 'metric',
          metricUnit: 'km',
          metricTarget: target,
          metricAggregation: aggregation,
        });
      const sessions = (...values: number[]): TreeFacts => ({
        ...NO_FACTS,
        doneSessions: values.map((value) => ({
          objectiveId: 'root',
          value,
        })),
      });

      it('sums sessions', () => {
        const tree = new ObjectiveTree([metric('sum')], sessions(2, 3));
        expect(tree.percent('root')).toBe(50);
        expect(tree.amount('root')).toEqual({
          current: 5,
          target: 10,
          unit: 'km',
        });
      });

      it('keeps the best session', () => {
        const tree = new ObjectiveTree([metric('max')], sessions(2, 3));
        expect(tree.percent('root')).toBe(30);
        expect(tree.amount('root')?.current).toBe(3);
      });

      it('caps the bar but keeps the amount past the target', () => {
        const tree = new ObjectiveTree([metric('sum')], sessions(8, 7));
        expect(tree.percent('root')).toBe(100);
        expect(tree.amount('root')?.current).toBe(15);
      });

      it('starts at zero, and survives a missing target', () => {
        expect(
          new ObjectiveTree([metric('sum')], NO_FACTS).percent('root'),
        ).toBe(0);
        expect(
          new ObjectiveTree([metric('sum', 0)], sessions(4)).percent('root'),
        ).toBe(0);
      });
    });

    describe('habit', () => {
      const habit = root({ completion: 'habit', habitTargetDays: 4 });
      const checkIns = (...users: string[]): TreeFacts => ({
        ...NO_FACTS,
        checkIns: users.map((userId) => ({ objectiveId: 'root', userId })),
      });

      it('counts the owner’s days alone by default', () => {
        const tree = new ObjectiveTree([habit], checkIns('ada', 'ada', 'ada'));
        expect(tree.percent('root')).toBe(75);
        expect(tree.amount('root')).toEqual({
          current: 3,
          target: 4,
          unit: 'jours',
        });
      });

      it('averages each participant, so one person cannot finish it alone', () => {
        const tree = new ObjectiveTree(
          [habit],
          checkIns('ada', 'ada', 'ada', 'ada', 'ada', 'bob', 'bob'),
          () => ['ada', 'bob'],
        );
        // Ada is capped at 100%, Bob is at 50%.
        expect(tree.percent('root')).toBe(75);
      });

      it('ignores people who no longer take part', () => {
        const tree = new ObjectiveTree(
          [habit],
          checkIns('gone', 'gone', 'gone', 'gone'),
        );
        expect(tree.percent('root')).toBe(0);
      });

      it('survives a missing target or nobody taking part', () => {
        expect(
          new ObjectiveTree(
            [root({ completion: 'habit', habitTargetDays: 0 })],
            NO_FACTS,
          ).percent('root'),
        ).toBe(0);
        expect(
          new ObjectiveTree([habit], NO_FACTS, () => []).percent('root'),
        ).toBe(0);
        expect(
          new ObjectiveTree([habit], NO_FACTS, () => []).amount('root')
            ?.current,
        ).toBe(0);
      });
    });

    describe('children', () => {
      it('is empty without children', () => {
        expect(new ObjectiveTree([root()], NO_FACTS).percent('root')).toBe(0);
      });

      it('averages children, equal weights by default', () => {
        const tree = new ObjectiveTree(
          [
            root(),
            node('a', { completion: 'manual', manualProgress: 100 }),
            node('b', { completion: 'manual', manualProgress: 0 }),
          ],
          NO_FACTS,
        );
        expect(tree.percent('root')).toBe(50);
      });

      it('follows the weights', () => {
        const tree = new ObjectiveTree(
          [
            root(),
            node('a', {
              completion: 'manual',
              manualProgress: 100,
              weight: 3,
            }),
            node('b', { completion: 'manual', manualProgress: 0, weight: 1 }),
          ],
          NO_FACTS,
        );
        expect(tree.percent('root')).toBe(75);
      });

      it('counts a child without a bar as 0, or 100 once marked complete', () => {
        const tree = new ObjectiveTree(
          [root(), node('a', { status: 'completed' }), node('b')],
          NO_FACTS,
        );
        expect(tree.percent('root')).toBe(50);
      });

      it('rolls up through every level', () => {
        const tree = new ObjectiveTree(
          [
            root(),
            node('a', { completion: 'children' }),
            node('a1', {
              parentId: 'a',
              completion: 'manual',
              manualProgress: 50,
            }),
            node('b', { completion: 'manual', manualProgress: 100 }),
          ],
          NO_FACTS,
        );
        expect(tree.percent('a')).toBe(50);
        expect(tree.percent('root')).toBe(75);
      });

      it('leaves archived children out', () => {
        const tree = new ObjectiveTree(
          [
            root(),
            node('a', { completion: 'manual', manualProgress: 100 }),
            node('b', { archived: true }),
          ],
          NO_FACTS,
        );
        expect(tree.percent('root')).toBe(100);
      });

      it('never rounds up to 100 before everything is complete', () => {
        const children = Array.from({ length: 300 }, (_, index) =>
          node(`child-${index}`, { status: 'completed' }),
        );
        const tree = new ObjectiveTree(
          [root(), ...children, node('open')],
          NO_FACTS,
        );
        expect(tree.percent('root')).toBe(99);
      });
    });
  });
});
