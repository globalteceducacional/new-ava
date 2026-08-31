import { softDeleteData, notDeleted } from './soft-delete';

describe('softDelete helpers', () => {
  it('softDeleteData marca deletedAt e deletedBy', () => {
    const before = Date.now();
    const data = softDeleteData('user-1');
    expect(data.deletedBy).toBe('user-1');
    expect(data.deletedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('notDeleted filtra deletedAt null', () => {
    expect(notDeleted()).toEqual({ deletedAt: null });
  });
});
