/** Builds [{comment, children}] roots from a flat list (oldest first). */
export function buildTree(list) {
  const nodes = new Map(list.map((c) => [c.id, { comment: c, children: [] }]))
  const roots = []
  for (const c of list) {
    const node = nodes.get(c.id)
    const parent = c.parentId && nodes.get(c.parentId)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}
