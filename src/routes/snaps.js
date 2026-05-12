import { supabase } from '../db/supabase.js'

function expiresAt24hFromNow() {
  const d = new Date()
  d.setHours(d.getHours() + 24)
  return d.toISOString()
}

export default async function snapsRoutes(fastify) {
  fastify.post('/snap', async (request, reply) => {
    const { user_id: userId, event_id: eventId, photo_url: photoUrl } = request.body ?? {}

    if (!userId || !eventId || !photoUrl) {
      return reply.code(400).send({ error: 'user_id, event_id, and photo_url are required' })
    }

    const expires_at = expiresAt24hFromNow()

    const { data, error } = await supabase
      .from('snaps')
      .insert({
        user_id: userId,
        event_id: eventId,
        photo_url: photoUrl,
        expires_at,
      })
      .select()
      .single()

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(201).send({ snap: data })
  })
}
