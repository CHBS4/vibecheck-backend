import { supabase } from '../db/supabase.js'

function oneHourAgoIso() {
  const d = new Date()
  d.setHours(d.getHours() - 1)
  return d.toISOString()
}

async function getSnapsLastHourCount(eventId) {
  const since = oneHourAgoIso()
  const { count, error } = await supabase
    .from('snaps')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .gte('created_at', since)

  if (error) throw error
  return count ?? 0
}

function clampHypeScore(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

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

  fastify.get('/events/:id/snaps/count', async (request, reply) => {
    const { id: eventId } = request.params

    try {
      const count = await getSnapsLastHourCount(eventId)
      return { event_id: eventId, snaps_last_hour: count }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }
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

  fastify.post('/events/:id/checkin', async (request, reply) => {
    const { id: eventId } = request.params

    const { data: existing, error: fetchError } = await supabase
      .from('events')
      .select('id, checkin_count, hype_score, ticket_url')
      .eq('id', eventId)
      .single()

    if (fetchError) {
      fastify.log.error(fetchError)
      return reply.code(500).send({ error: fetchError.message })
    }

    const checkinCount = Number(existing?.checkin_count ?? 0) + 1
    const currentHype = Number(existing?.hype_score ?? 0)

    let snapsLastHour = 0
    try {
      snapsLastHour = await getSnapsLastHourCount(eventId)
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    const hypeScoreRaw = checkinCount * 0.3 + snapsLastHour * 0.5 + currentHype * 0.2
    const hype_score = clampHypeScore(hypeScoreRaw)

    const { data: updated, error: updateError } = await supabase
      .from('events')
      .update({ checkin_count: checkinCount, hype_score })
      .eq('id', eventId)
      .select('*')
      .single()

    if (updateError) {
      fastify.log.error(updateError)
      return reply.code(500).send({ error: updateError.message })
    }

    return reply.code(200).send({ event: updated })
  })

  fastify.put('/events/:id/ticket', async (request, reply) => {
    const { id: eventId } = request.params
    const { ticket_url } = request.body ?? {}

    if (typeof ticket_url !== 'string' || !ticket_url.trim()) {
      return reply.code(400).send({ error: 'ticket_url must be a non-empty string' })
    }

    const { data, error } = await supabase
      .from('events')
      .update({ ticket_url: ticket_url.trim() })
      .eq('id', eventId)
      .select('*')
      .single()

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(200).send({ event: data })
  })
}
