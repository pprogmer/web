import { useEffect, useState } from 'react'

export default function Admin() {
  const [data, setData] = useState({ servers: [], tasks: [] })

  useEffect(() => {
    const timer = setInterval(async () => {
      const res = await fetch('/api/admin')
      setData(await res.json())
    }, 2000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="bg-white rounded-xl shadow p-6 mb-6">
      <h2 className="text-lg font-bold mb-3">Servers</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {data.servers.map((server) => (
          <div key={server.name} className="border border-gray-200 rounded-lg p-3">
            <p className="font-medium">
              <span className={server.online ? 'text-green-600' : 'text-red-600'}>●</span> {server.name}
              <span className="text-sm text-gray-500"> {server.online ? 'online' : 'offline'}</span>
            </p>
            <p className="text-sm text-gray-600 mt-1">
              CPU {server.cpu}% · Memory {server.memory} MB
            </p>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-bold mt-6 mb-3">Active, queued and failed tasks</h2>
      {data.tasks.length === 0 && <p className="text-sm text-gray-500">No tasks right now</p>}
      {data.tasks.map((task) => (
        <div key={task.id} className="flex flex-wrap gap-x-3 border-t border-gray-100 py-2 text-sm">
          <span className="text-gray-400">#{task.id}</span>
          <span className="font-medium">{task.file_name}</span>
          <span className="text-gray-500">{task.email}</span>
          <span className={task.status === 'failed' ? 'text-red-600' : 'text-blue-600'}>{task.status}</span>
          <span className="text-gray-500">{task.server_name}</span>
          <span className="text-red-600">{task.error}</span>
        </div>
      ))}
    </div>
  )
}
