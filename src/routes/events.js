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

async function acceptedFriendIdsFor(userId) {
  const uid = String(userId)
  const { data, error } = await supabase
    .from('friend_requests')
    .select('sender_id, receiver_id')
    .eq('status', 'accepted')
    .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)

  if (error) throw error

  const friends = new Set()
  for (const row of data ?? []) {
    if (row.sender_id === uid) friends.add(row.receiver_id)
    else if (row.receiver_id === uid) friends.add(row.sender_id)
  }
  return Array.from(friends)
}

export default async function eventsRoutes(fastify) {
  fastify.post('/premium-events', async (request, reply) => {
    const {
      creator_id: creatorId,
      title,
      description,
      lat,
      lng,
      address,
      date,
      visibility,
    } = request.body ?? {}

    if (creatorId === undefined || creatorId === null || String(creatorId).trim() === '') {
      return reply.code(400).send({ error: 'creator_id is required' })
    }

    if (typeof title !== 'string' || !title.trim()) {
      return reply.code(400).send({ error: 'title is required' })
    }

    const latNum = typeof lat === 'number' ? lat : Number(lat)
    const lngNum = typeof lng === 'number' ? lng : Number(lng)
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return reply.code(400).send({ error: 'lat and lng are required and must be numbers' })
    }

    const row = {
      creator_id: String(creatorId).trim(),
      title: title.trim(),
      description: description != null && String(description).trim() ? String(description).trim() : null,
      lat: latNum,
      lng: lngNum,
      address: address != null && String(address).trim() ? String(address).trim() : null,
      date: date != null && String(date).trim() ? String(date).trim() : null,
      visibility:
        typeof visibility === 'string' && visibility.trim() ? visibility.trim() : 'friends_only',
    }

    const { data, error } = await supabase.from('premium_events').insert(row).select().single()

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(201).send({ premium_event: data })
  })

  fastify.get('/premium-events', async (request, reply) => {
    const { visibility, user_id: userId } = request.query ?? {}
    const wantPublic = visibility === 'public_premium'
    const hasUserId = userId !== undefined && userId !== null && String(userId).trim() !== ''

    let query = supabase.from('premium_events').select('*')

    if (hasUserId) {
      const uid = String(userId).trim()
      let creatorIds = [uid]
      try {
        const friends = await acceptedFriendIdsFor(uid)
        creatorIds = [...creatorIds, ...friends]
      } catch (err) {
        fastify.log.error(err)
        return reply.code(500).send({ error: err.message })
      }
      query = query.in('creator_id', creatorIds)
    }

    if (wantPublic) {
      query = query.eq('visibility', 'public_premium')
    }

    query = query.order('date', { ascending: true })

    const { data, error } = await query

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return { premium_events: data ?? [] }
  })

  fastify.delete('/premium-events/:id', async (request, reply) => {
    const { id } = request.params ?? {}

    const { data, error } = await supabase.from('premium_events').delete().eq('id', id).select('id').maybeSingle()

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    if (!data) {
      return reply.code(404).send({ error: 'Not found' })
    }

    return reply.code(200).send({ ok: true })
  })

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
