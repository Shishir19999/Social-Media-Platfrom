import { expect, it } from 'vitest'
import { buildTree } from './tree'

it('nests replies under their parent and keeps orphans at the top', () => {
  const list = [
    { id: 'a', parentId: null }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' },
    { id: 'd', parentId: null }, { id: 'e', parentId: 'gone' },
  ]
  const tree = buildTree(list)
  expect(tree.map((n) => n.comment.id)).toEqual(['a', 'd', 'e'])
  expect(tree[0].children[0].children[0].comment.id).toBe('c')
})
