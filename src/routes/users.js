import { supabase } from '../db/supabase.js'

export default async function usersRoutes(fastify) {
  fastify.post('/users/username', async (request, reply) => {
    const { user_id: userId, username } = request.body ?? {}

    if (!userId || typeof username !== 'string' || !username.trim()) {
      return reply.code(400).send({ error: 'user_id and username are required' })
    }

    const payload = { user_id: String(userId), username: username.trim() }

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select('user_id, username, display_name, avatar_url')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.code(409).send({ error: 'Username already in use' })
      }
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(200).send({ profile: data })
  })

  fastify.get('/users/:user_id/profile', async (request, reply) => {
    const { user_id: userId } = request.params ?? {}

    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, username, display_name, avatar_url')
      .eq('user_id', String(userId))
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return reply.code(404).send({ error: 'Profile not found' })
      }
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(200).send({ profile: data })
  })

  fastify.get('/users/search', async (request, reply) => {
    const { username } = request.query ?? {}
    const q = typeof username === 'string' ? username.trim() : ''

    if (!q) {
      return reply.code(400).send({ error: 'username query param is required' })
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, username, display_name, avatar_url')
      .ilike('username', `%${q}%`)
      .order('username', { ascending: true })
      .limit(25)

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(200).send({ profiles: data ?? [] })
  })

  fastify.put('/user/location', async (request, reply) => {
    const { user_id: userId, city } = request.body ?? {}

    if (!userId || city === undefined || city === null) {
      return reply.code(400).send({ error: 'user_id and city are required' })
    }

    const { data, error } = await supabase
      .from('users')
      .update({ city: String(city), updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    if (!data) {
      return reply.code(404).send({ error: 'User not found' })
    }

    return { user: data }
  })
}
