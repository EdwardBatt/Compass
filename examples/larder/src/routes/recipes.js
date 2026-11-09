import { db } from '../lib/db.js'

export function recipes(req, res) {
  const rows = db.prepare('SELECT id, title, serves FROM recipe ORDER BY title').all()
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(rows))
}
