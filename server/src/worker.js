import { fork } from 'node:child_process'
import { db, addLog } from './db.js'

const MAX_TIME = 60 * 1000

export async function startWorker() {
  await db.query(`update tasks set status = 'queued', stage = null, progress = 0 where status = 'running'`)

  while (true) {
    const result = await db.query(`
      update tasks set status = 'running', stage = 'Starting', progress = 5, started_at = now()
      where id = (select id from tasks where status = 'queued' order by id limit 1)
      returning id, input, input_type
    `)

    if (result.rows.length > 0) {
      await processTask(result.rows[0])
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
}

function processTask(task) {
  return new Promise((resolve) => {
    addLog(task.id, 'Processing started')
    const child = fork('src/remover.js', { serialization: 'advanced' })
    let lastStage = ''

    const timeout = setTimeout(() => {
      failTask(task.id, `Time limit exceeded (${MAX_TIME / 1000} s)`)
      child.kill()
    }, MAX_TIME)

    const cancelCheck = setInterval(async () => {
      const result = await db.query('select status from tasks where id = $1', [task.id])
      if (result.rows.length === 0 || result.rows[0].status !== 'running') child.kill()
    }, 1000)

    child.on('message', async (message) => {
      if (message.error) {
        await failTask(task.id, message.error)
      } else if (message.result) {
        await db.query(
          `update tasks set status = 'done', stage = null, progress = 100, output = $1, finished_at = now()
           where id = $2 and status = 'running'`,
          [Buffer.from(message.result), task.id],
        )
        await addLog(task.id, 'Background removed')
      } else {
        await db.query(`update tasks set stage = $1, progress = $2 where id = $3 and status = 'running'`, [
          message.stage,
          message.progress,
          task.id,
        ])
        if (message.stage !== lastStage) {
          lastStage = message.stage
          await addLog(task.id, message.stage)
        }
      }
    })

    child.on('exit', () => {
      clearTimeout(timeout)
      clearInterval(cancelCheck)
      resolve()
    })

    child.send({ image: task.input, type: task.input_type })
  })
}

async function failTask(taskId, error) {
  const result = await db.query(
    `update tasks set status = 'failed', stage = null, error = $1, finished_at = now()
     where id = $2 and status = 'running'`,
    [error, taskId],
  )
  if (result.rowCount > 0) await addLog(taskId, 'Failed: ' + error)
}
