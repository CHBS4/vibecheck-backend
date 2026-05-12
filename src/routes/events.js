import { supabase } from '../db/supabase.js'

export default async function eventsRoutes(fastify) {
  fastify.get('/events', async (request, reply) => {
    const { city } = request.query

    let query = supabase.from('events').select('*').order('starts_at', { ascending: true })

    if (city && String(city).trim()) {
      query = query.ilike('city', `%${String(city).trim()}%`)
    }

    const { data, error } = await query

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return { events: data ?? [] }
  })

  fastify.get('/events/:id/snaps', async (request, reply) => {
    const { id: eventId } = request.params

    const { data, error } = await supabase
      .from('snaps')
      .select('*')
      .eq('event_id', eventId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return { snaps: data ?? [] }
  })
}
