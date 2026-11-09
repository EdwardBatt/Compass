import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

export const db = new DatabaseSync(process.env.LARDER_DB ?? 'larder.db')
const schema = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8')
db.exec(schema.replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS '))
