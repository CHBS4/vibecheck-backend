import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'

import eventsRoutes from './routes/events.js'
import checkinsRoutes from './routes/checkins.js'
import snapsRoutes from './routes/snaps.js'
import usersRoutes from './routes/users.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(import('@fastify/multipart'), {
  limits: { fileSize: 5 * 1024 * 1024 },
})

await fastify.register(eventsRoutes)
await fastify.register(checkinsRoutes)
await fastify.register(snapsRoutes)
await fastify.register(usersRoutes)

fastify.get('/health', async () => ({ ok: true, service: 'vibecheck' }))

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

try {
  await fastify.listen({ port, host })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
