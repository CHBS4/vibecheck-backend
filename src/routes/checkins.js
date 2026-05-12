import { supabase } from '../db/supabase.js'

export default async function checkinsRoutes(fastify) {
  fastify.post('/checkin', async (request, reply) => {
    const { user_id: userId, event_id: eventId } = request.body ?? {}

    if (!userId || !eventId) {
      return reply.code(400).send({ error: 'user_id and event_id are required' })
    }

    const { data, error } = await supabase
      .from('checkins')
      .insert({ user_id: userId, event_id: eventId })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.code(409).send({ error: 'User already checked in to this event' })
      }
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(201).send({ checkin: data })
  })
}
