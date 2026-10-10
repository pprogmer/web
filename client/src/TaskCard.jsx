import { useState } from 'react'

export default function TaskCard({ task, onChange }) {
  const [logs, setLogs] = useState(null)

  const isActive = task.status === 'queued' || task.status === 'running'
  const imageUrl = task.status === 'done' ? `/api/tasks/${task.id}/result` : `/api/tasks/${task.id}/input`

  async function cancelTask() {
    await fetch(`/api/tasks/${task.id}/cancel`, { method: 'POST' })
    onChange()
  }

  async function deleteTask() {
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    onChange()
  }

  async function toggleLogs() {
    if (logs) return setLogs(null)
    const res = await fetch(`/api/tasks/${task.id}/logs`)
    setLogs(await res.json())
  }

  return (
    <div className="bg-white rounded-xl shadow p-3">
      <a href={imageUrl} target="_blank">
        <img src={imageUrl} className="checker w-full h-48 object-contain rounded" />
      </a>

      <p className="font-medium truncate mt-2">{task.file_name}</p>
      <p className="text-sm">
        Status: <b>{task.status}</b>
      </p>

      {task.status === 'running' && (
        <div className="mt-1">
          <p className="text-sm text-gray-500">
            {task.stage} - {task.progress}%
          </p>
          <div className="h-2 bg-gray-200 rounded">
            <div className="h-2 bg-blue-600 rounded" style={{ width: task.progress + '%' }} />
          </div>
        </div>
      )}
      {task.error && <p className="text-sm text-red-600">{task.error}</p>}

      <div className="flex gap-3 mt-2 text-sm text-blue-600">
        {task.status === 'done' && <a href={`/api/tasks/${task.id}/result?download=1`}>Download</a>}
        {isActive && <button onClick={cancelTask}>Cancel</button>}
        {!isActive && <button onClick={deleteTask}>Delete</button>}
        <button onClick={toggleLogs}>{logs ? 'Hide logs' : 'Logs'}</button>
      </div>

      {logs && (
        <ul className="text-xs text-gray-600 mt-2">
          {logs.map((log, i) => (
            <li key={i}>
              {new Date(log.created_at).toLocaleTimeString()} - {log.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
