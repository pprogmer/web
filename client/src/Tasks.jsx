import { useEffect, useState } from 'react'
import TaskCard from './TaskCard'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [errors, setErrors] = useState([])

  async function loadTasks() {
    const res = await fetch('/api/tasks')
    if (res.ok) setTasks(await res.json())
  }

  useEffect(() => {
    loadTasks()
    const timer = setInterval(loadTasks, 1000)
    return () => clearInterval(timer)
  }, [])

  async function upload(e) {
    const newErrors = []

    for (const file of e.target.files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        newErrors.push(file.name + ': only JPEG, PNG and WebP images are allowed')
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        newErrors.push(file.name + ': file is bigger than 10 MB')
        continue
      }

      const res = await fetch('/api/tasks?name=' + encodeURIComponent(file.name), { method: 'POST', body: file })
      if (!res.ok) {
        const data = await res.json()
        newErrors.push(file.name + ': ' + data.error)
      }
      loadTasks()
    }

    setErrors(newErrors)
    e.target.value = ''
  }

  return (
    <div>
      <div className="bg-white rounded-xl shadow p-6">
        <input type="file" multiple accept={ALLOWED_TYPES.join(',')} onChange={upload} />
        <p className="text-sm text-gray-500 mt-2">
          JPEG, PNG or WebP, up to 10 MB and 4096x4096 px. You can have 3 active and 20 stored tasks.
        </p>
        {errors.map((error) => (
          <p key={error} className="text-red-600 text-sm mt-1">
            {error}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onChange={loadTasks} />
        ))}
      </div>
    </div>
  )
}
