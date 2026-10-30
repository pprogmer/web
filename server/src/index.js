import crypto from 'node:crypto'
import express from 'express'
import sharp from 'sharp'
import { db, createTables, addLog } from './db.js'
import { startWorker } from './worker.js'

const MAX_IMAGE_SIDE = 4096
const MAX_ACTIVE_TASKS = 3
const MAX_STORED_TASKS = 20
const SERVER_NAME = process.env.SERVER_NAME || 'server'

const app = express()
app.use((req, res, next) => {
  res.set('X-Server', SERVER_NAME)
  next()
})
app.use(express.json())
app.use(express.static('public'))

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return salt + ':' + hash
}

function checkPassword(password, savedPassword) {
  const salt = savedPassword.split(':')[0]
  return hashPassword(password, salt) === savedPassword
}

function getToken(req) {
  const cookies = (req.headers.cookie || '').split('; ')
  const tokenCookie = cookies.find((cookie) => cookie.startsWith('token='))
  return tokenCookie ? tokenCookie.slice(6) : null
}

async function auth(req, res, next) {
  const result = await db.query(
    'select users.id, users.email, users.role from sessions join users on users.id = sessions.user_id where token = $1',
    [getToken(req)],
  )
  if (result.rows.length === 0) return res.status(401).json({ error: 'Please log in' })
  req.user = result.rows[0]
  next()
}

async function startSession(res, userId) {
  const token = crypto.randomUUID()
  await db.query('insert into sessions (token, user_id) values ($1, $2)', [token, userId])
  res.cookie('token', token, { httpOnly: true, sameSite: 'strict' })
  res.json({ ok: true })
}

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body
  if (!email.includes('@')) return res.status(400).json({ error: 'Enter a valid email' })
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

  const existing = await db.query('select id from users where email = $1', [email])
  if (existing.rows.length > 0) return res.status(400).json({ error: 'User with this email already exists' })

  const result = await db.query('insert into users (email, password) values ($1, $2) returning id', [
    email,
    hashPassword(password),
  ])
  await startSession(res, result.rows[0].id)
})

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body
  const result = await db.query('select * from users where email = $1', [email])
  console.log(result)
  const user = result.rows[0]
  if (!user || !checkPassword(password, user.password)) {
    return res.status(400).json({ error: 'Wrong email or password' })
  }
  await startSession(res, user.id)
})

app.post('/api/logout', auth, async (req, res) => {
  await db.query('delete from sessions where token = $1', [getToken(req)])
  res.clearCookie('token')
  res.json({ ok: true })
})

app.get('/api/health', (req, res) => {
  res.json({ ok: true, server: SERVER_NAME })
})

app.get('/api/me', auth, (req, res) => {
  res.json(req.user)
})

app.get('/api/tasks', auth, async (req, res) => {
  const result = await db.query(
    `select id, file_name, status, stage, progress, error, server_name, created_at,
       (select count(*)::int from tasks queue where queue.status = 'queued' and queue.id <= tasks.id) as queue_position
     from tasks where user_id = $1 order by id desc`,
    [req.user.id],
  )

  const servers = await db.query(`select count(*)::int as count from servers where last_seen > now() - interval '10 seconds'`)
  const average = await db.query(`
    select coalesce(avg(extract(epoch from finished_at - started_at)), 20)::float as seconds
    from (select * from tasks where status = 'done' order by id desc limit 10) last_tasks
  `)
  const serverCount = Math.max(servers.rows[0].count, 1)

  for (const task of result.rows) {
    if (task.status === 'queued') {
      task.eta = Math.ceil(Math.ceil(task.queue_position / serverCount) * average.rows[0].seconds)
    }
  }
  res.json(result.rows)
})

app.post('/api/tasks', auth, express.raw({ type: 'image/*', limit: '10mb' }), async (req, res) => {
  const image = req.body
  if (!Buffer.isBuffer(image)) return res.status(400).json({ error: 'Only JPEG, PNG and WebP images are allowed' })

  const info = await sharp(image).metadata().catch(() => ({}))
  if (!['jpeg', 'png', 'webp'].includes(info.format)) {
    return res.status(400).json({ error: 'Only JPEG, PNG and WebP images are allowed' })
  }
  if (info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE) {
    return res.status(400).json({ error: `Image is too big, max size is ${MAX_IMAGE_SIDE}x${MAX_IMAGE_SIDE} px` })
  }

  const userTasks = await db.query('select status from tasks where user_id = $1', [req.user.id])
  const activeTasks = userTasks.rows.filter((task) => task.status === 'queued' || task.status === 'running')
  if (activeTasks.length >= MAX_ACTIVE_TASKS) {
    return res.status(400).json({ error: `You can have only ${MAX_ACTIVE_TASKS} active tasks at once` })
  }
  if (userTasks.rows.length >= MAX_STORED_TASKS) {
    return res.status(400).json({ error: `You can store only ${MAX_STORED_TASKS} tasks, delete some old ones` })
  }

  const result = await db.query(
    'insert into tasks (user_id, file_name, input, input_type) values ($1, $2, $3, $4) returning id',
    [req.user.id, req.query.name || 'image', image, 'image/' + info.format],
  )
  await addLog(result.rows[0].id, 'Task created')
  res.json({ id: result.rows[0].id })
})

app.get('/api/tasks/:id/input', auth, async (req, res) => {
  const result = await db.query('select input, input_type from tasks where id = $1 and user_id = $2', [
    req.params.id,
    req.user.id,
  ])
  const task = result.rows[0]
  if (!task) return res.status(404).json({ error: 'Task not found' })
  res.type(task.input_type).send(task.input)
})

app.get('/api/tasks/:id/result', auth, async (req, res) => {
  const result = await db.query('select output, file_name from tasks where id = $1 and user_id = $2', [
    req.params.id,
    req.user.id,
  ])
  const task = result.rows[0]
  if (!task || !task.output) return res.status(404).json({ error: 'Result not found' })
  if (req.query.download) res.attachment('no-bg-' + task.file_name.split('.')[0] + '.png')
  res.type('png').send(task.output)
})

app.get('/api/tasks/:id/logs', auth, async (req, res) => {
  const result = await db.query(
    `select task_logs.message, task_logs.created_at from task_logs
     join tasks on tasks.id = task_logs.task_id
     where tasks.id = $1 and tasks.user_id = $2 order by task_logs.id`,
    [req.params.id, req.user.id],
  )
  res.json(result.rows)
})

app.post('/api/tasks/:id/cancel', auth, async (req, res) => {
  const result = await db.query(
    `update tasks set status = 'cancelled', finished_at = now()
     where id = $1 and user_id = $2 and status in ('queued', 'running')`,
    [req.params.id, req.user.id],
  )
  if (result.rowCount > 0) await addLog(req.params.id, 'Cancelled by user')
  res.json({ ok: true })
})

app.delete('/api/tasks/:id', auth, async (req, res) => {
  await db.query('delete from tasks where id = $1 and user_id = $2', [req.params.id, req.user.id])
  res.json({ ok: true })
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message })
})

function sendHeartbeat() {
  db.query(
    `insert into servers (name) values ($1) on conflict (name) do update set last_seen = now()`,
    [SERVER_NAME],
  ).catch(() => {})
}

await createTables()
sendHeartbeat()
setInterval(sendHeartbeat, 2000)
startWorker()
app.listen(3000, () => console.log(SERVER_NAME + ' started on port 3000'))
