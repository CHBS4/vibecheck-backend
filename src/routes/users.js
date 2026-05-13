import { supabase } from '../db/supabase.js'

const IMG_PREFIX = '[IMG]'

function snapUrlFromMessageContent(trimmedContent) {
  if (!trimmedContent.startsWith(IMG_PREFIX)) return null
  const url = trimmedContent.slice(IMG_PREFIX.length).trim()
  return url || null
}

export default async function usersRoutes(fastify) {
  fastify.post('/users/username', async (request, reply) => {
    const { user_id: userId, username, email } = request.body ?? {}

    if (!userId || typeof username !== 'string' || !username.trim()) {
      return reply.code(400).send({ error: 'user_id and username are required' })
    }

    const payload = { user_id: String(userId), username: username.trim() }
    if (typeof email === 'string' && email.trim()) {
      payload.email = email.trim().toLowerCase()
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select('user_id, username, email, display_name, avatar_url')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.code(409).send({ error: 'Username or email already in use' })
      }
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(200).send({ profile: data })
  })

  fastify.get('/users/:user_id/profile', async (request, reply) => {
    const { user_id: userId } = request.params ?? {}
    const lookup = String(userId)

    const byId = await supabase
      .from('user_profiles')
      .select('user_id, username, email, display_name, avatar_url')
      .eq('user_id', lookup)
      .maybeSingle()

    if (byId.error) {
      fastify.log.error(byId.error)
      return reply.code(500).send({ error: byId.error.message })
    }

    if (byId.data) {
      return reply.code(200).send({ profile: byId.data })
    }

    const byEmail = await supabase
      .from('user_profiles')
      .select('user_id, username, email, display_name, avatar_url')
      .eq('email', lookup.toLowerCase())
      .maybeSingle()

    if (byEmail.error) {
      fastify.log.error(byEmail.error)
      return reply.code(500).send({ error: byEmail.error.message })
    }

    if (!byEmail.data) {
      return reply.code(404).send({ error: 'Profile not found' })
    }

    return reply.code(200).send({ profile: byEmail.data })
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

  fastify.put('/users/:user_id/display-name', async (request, reply) => {
    const { user_id: userId } = request.params ?? {}
    const { display_name: displayName } = request.body ?? {}

    if (typeof displayName !== 'string') {
      return reply.code(400).send({ error: 'display_name is required and must be a string' })
    }

    const payload = {
      user_id: String(userId),
      display_name: displayName.trim(),
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select('user_id, username, display_name, avatar_url')
      .single()

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(200).send({ profile: data })
  })

  fastify.put('/users/:user_id/avatar', async (request, reply) => {
    const { user_id: userId } = request.params ?? {}
    const { avatar_url: avatarUrl } = request.body ?? {}

    if (typeof avatarUrl !== 'string') {
      return reply.code(400).send({ error: 'avatar_url is required and must be a string' })
    }

    const payload = {
      user_id: String(userId),
      avatar_url: avatarUrl.trim(),
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select('user_id, username, display_name, avatar_url')
      .single()

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(200).send({ profile: data })
  })

  fastify.post('/users/:user_id/avatar-base64', async (request, reply) => {
    const { user_id: userId } = request.params
    const { base64, contentType } = request.body
    const buffer = Buffer.from(base64, 'base64')
    const fileName = 'avatars/' + userId + '.jpg'
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(fileName, buffer, { upsert: true, contentType: contentType || 'image/jpeg' })
    if (uploadError) return reply.code(500).send({ error: uploadError.message })
    const { data } = supabase.storage.from('logos').getPublicUrl(fileName)
    await supabase
      .from('user_profiles')
      .upsert({ user_id: userId, avatar_url: data.publicUrl }, { onConflict: 'user_id' })
    return reply.send({ avatar_url: data.publicUrl })
  })

  fastify.post('/friends/request', async (request, reply) => {
    const { sender_id: senderId, receiver_id: receiverId } = request.body ?? {}

    if (!senderId || !receiverId) {
      return reply.code(400).send({ error: 'sender_id and receiver_id are required' })
    }

    const sender = String(senderId)
    const receiver = String(receiverId)

    if (sender === receiver) {
      return reply.code(400).send({ error: 'sender_id and receiver_id must differ' })
    }

    const { data, error } = await supabase
      .from('friend_requests')
      .insert({ sender_id: sender, receiver_id: receiver, status: 'pending' })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.code(409).send({ error: 'Friend request already exists between these users' })
      }
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(201).send({ request: data })
  })

  fastify.get('/friends/requests/:user_id', async (request, reply) => {
    const { user_id: userId } = request.params ?? {}
    const uid = String(userId)

    const { data: reqs, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('receiver_id', uid)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    const list = reqs ?? []
    const senderIds = [...new Set(list.map((r) => r.sender_id))]
    let bySender = {}

    if (senderIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('user_id, username')
        .in('user_id', senderIds)

      if (profilesError) {
        fastify.log.error(profilesError)
        return reply.code(500).send({ error: profilesError.message })
      }

      bySender = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.username]))
    }

    const requests = list.map((r) => ({
      ...r,
      sender_username: bySender[r.sender_id] ?? null,
    }))

    return reply.code(200).send({ requests })
  })

  fastify.put('/friends/request/:id/accept', async (request, reply) => {
    const { id } = request.params ?? {}

    const { data, error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    if (!data) {
      return reply.code(404).send({ error: 'Friend request not found' })
    }

    return reply.code(200).send({ request: data })
  })

  fastify.delete('/friends/request/:id', async (request, reply) => {
    const { id } = request.params ?? {}

    const { data, error } = await supabase.from('friend_requests').delete().eq('id', id).select().maybeSingle()

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    if (!data) {
      return reply.code(404).send({ error: 'Friend request not found' })
    }

    return reply.code(200).send({ ok: true, request: data })
  })

  fastify.get('/friends/:user_id', async (request, reply) => {
    const { user_id: userId } = request.params ?? {}
    const uid = String(userId)

    const { data: rows, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('status', 'accepted')
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    const friendships = rows ?? []
    const friendIds = friendships.map((r) => (r.sender_id === uid ? r.receiver_id : r.sender_id))

    if (friendIds.length === 0) {
      return reply.code(200).send({ friends: [] })
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('user_id, username, display_name, avatar_url')
      .in('user_id', friendIds)

    if (profilesError) {
      fastify.log.error(profilesError)
      return reply.code(500).send({ error: profilesError.message })
    }

    const order = new Map(friendIds.map((id, i) => [id, i]))
    const sorted = [...(profiles ?? [])].sort((a, b) => (order.get(a.user_id) ?? 0) - (order.get(b.user_id) ?? 0))

    return reply.code(200).send({ friends: sorted })
  })

  fastify.post('/messages', async (request, reply) => {
    const { sender_id: senderId, receiver_id: receiverId, content } = request.body ?? {}

    if (!senderId || !receiverId) {
      return reply.code(400).send({ error: 'sender_id and receiver_id are required' })
    }

    if (typeof content !== 'string' || !content.trim()) {
      return reply.code(400).send({ error: 'content is required and must be a non-empty string' })
    }

    const trimmed = content.trim()
    const snap_url = snapUrlFromMessageContent(trimmed)

    const row = {
      sender_id: String(senderId),
      receiver_id: String(receiverId),
      content: trimmed,
    }
    if (snap_url !== null) {
      row.snap_url = snap_url
    }

    const { data, error } = await supabase.from('messages').insert(row).select().single()

    if (error) {
      fastify.log.error(error)
      return reply.code(500).send({ error: error.message })
    }

    return reply.code(201).send({ message: data })
  })

  fastify.get('/messages/:user_id/:other_user_id', async (request, reply) => {
    const { user_id: a, other_user_id: b } = request.params ?? {}
    const uid1 = String(a)
    const uid2 = String(b)

    const [outward, inward] = await Promise.all([
      supabase
        .from('messages')
        .select('*')
        .eq('sender_id', uid1)
        .eq('receiver_id', uid2)
        .order('created_at', { ascending: true }),
      supabase
        .from('messages')
        .select('*')
        .eq('sender_id', uid2)
        .eq('receiver_id', uid1)
        .order('created_at', { ascending: true }),
    ])

    if (outward.error) {
      fastify.log.error(outward.error)
      return reply.code(500).send({ error: outward.error.message })
    }

    if (inward.error) {
      fastify.log.error(inward.error)
      return reply.code(500).send({ error: inward.error.message })
    }

    const merged = [...(outward.data ?? []), ...(inward.data ?? [])].sort(
      (x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime(),
    )

    return reply.code(200).send({ messages: merged })
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
