import { useState } from 'react'

export default function Login({ onLogin }) {
  const [error, setError] = useState('')

  async function send(url) {
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()

    if (res.ok) onLogin()
    else setError(data.error)
  }

  return (
    <div className="max-w-sm mx-auto mt-32 bg-white p-6 rounded-xl shadow">
      <h1 className="text-2xl font-bold mb-4">Background Remover</h1>
      <input id="email" placeholder="Email" className="border rounded w-full p-2 mb-2" />
      <input id="password" type="password" placeholder="Password" className="border rounded w-full p-2 mb-2" />
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => send('/api/login')} className="flex-1 bg-blue-600 text-white rounded p-2">
          Log in
        </button>
        <button onClick={() => send('/api/register')} className="flex-1 border rounded p-2">
          Register
        </button>
      </div>
    </div>
  )
}
