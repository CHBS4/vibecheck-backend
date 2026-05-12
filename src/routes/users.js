import { supabase } from '../db/supabase.js'

export default async function usersRoutes(fastify) {
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
