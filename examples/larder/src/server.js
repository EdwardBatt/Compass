import { createServer } from 'node:http'
import { recipes } from './routes/recipes.js'
import { lists } from './routes/lists.js'

const routes = { '/recipes': recipes, '/lists': lists }

createServer((req, res) => {
  const prefix = '/' + (req.url.split('/')[1] ?? '')
  const handler = routes[prefix]
  if (!handler) return res.writeHead(404).end()
  handler(req, res)
}).listen(process.env.PORT ?? 3000)
