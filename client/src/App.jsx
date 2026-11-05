import { useEffect, useState } from 'react'
import Login from './Login'
import Tasks from './Tasks'
import Admin from './Admin'

export default function App() {
  const [user, setUser] = useState(undefined)

  async function loadUser() {
    const res = await fetch('/api/me')
    setUser(res.ok ? await res.json() : null)
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    setUser(null)
  }

  useEffect(() => {
    loadUser()
  }, [])

  if (user === undefined) return null
  if (user === null) return <Login onLogin={loadUser} />

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Background Remover</h1>
        <div>
          <span className="text-gray-500 mr-4">{user.email}</span>
          <button onClick={logout} className="bg-white border rounded px-3 py-1">
            Log out
          </button>
        </div>
      </div>
      {user.role === 'admin' && <Admin />}
      <Tasks />
    </div>
  )
}
