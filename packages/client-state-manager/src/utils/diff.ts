export interface DiffResult {
  path: string;
  type: 'added' | 'removed' | 'modified';
  oldValue: unknown;
  newValue: unknown;
}

export function deepDiff(obj1: unknown, obj2: unknown, path = ''): DiffResult[] {
  const differences: DiffResult[] = [];

  if (obj1 === obj2) return differences;

  if (typeof obj1 !== typeof obj2) {
    differences.push({
      path: path || 'root',
      type: 'modified',
      oldValue: obj1,
      newValue: obj2
    });
    return differences;
  }

  if (obj1 === null || obj2 === null) {
    differences.push({
      path: path || 'root',
      type: obj1 === null ? 'added' : 'removed',
      oldValue: obj1,
      newValue: obj2
    });
    return differences;
  }

  if (typeof obj1 !== 'object') {
    differences.push({
      path: path || 'root',
      type: 'modified',
      oldValue: obj1,
      newValue: obj2
    });
    return differences;
  }

  const keys1 = Object.keys(obj1 as Record<string, unknown>);
  const keys2 = Object.keys(obj2 as Record<string, unknown>);
  const allKeys = new Set([...keys1, ...keys2]);

  for (const key of allKeys) {
    const currentPath = path ? `${path}.${key}` : key;
    const val1 = (obj1 as Record<string, unknown>)[key];
    const val2 = (obj2 as Record<string, unknown>)[key];

    if (!(key in (obj1 as Record<string, unknown>))) {
      differences.push({
        path: currentPath,
        type: 'added',
        oldValue: undefined,
        newValue: val2
      });
    } else if (!(key in (obj2 as Record<string, unknown>))) {
      differences.push({
        path: currentPath,
        type: 'removed',
        oldValue: val1,
        newValue: undefined
      });
    } else {
      differences.push(...deepDiff(val1, val2, currentPath));
    }
  }

  return differences;
}

export function isEqual(obj1: unknown, obj2: unknown): boolean {
  return deepDiff(obj1, obj2).length === 0;
}
