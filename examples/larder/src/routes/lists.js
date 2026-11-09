import { db } from '../lib/db.js'
import { merge } from '../lib/merge.js'

export function lists(req, res) {
  const listId = Number(req.url.split('/')[2])
  const items = db.prepare('SELECT name, quantity, unit FROM list_item WHERE list_id = ?').all(listId)
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(merge(items)))
}
