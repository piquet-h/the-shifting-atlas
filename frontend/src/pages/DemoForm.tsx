import React, { useState } from 'react';

export default function DemoForm(): React.ReactElement {
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  return (
    <main className="min-h-screen p-5 bg-gradient-to-b from-atlas-bg to-atlas-bg-dark text-slate-100">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Demo Form</h1>
        <form className="space-y-4 bg-white/3 p-4 rounded-lg" aria-labelledby="demo-form-heading">
          <div>
            <label htmlFor="demo-name" className="block text-sm font-medium mb-1">
              Name
            </label>
            <input
              id="demo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="demo-email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="demo-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md"
              placeholder="you@example.com"
              aria-describedby="demo-email-help"
            />
            <p id="demo-email-help" className="sr-only">
              Enter a valid email address.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="px-4 py-2 rounded bg-atlas-accent text-emerald-900 font-semibold"
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
