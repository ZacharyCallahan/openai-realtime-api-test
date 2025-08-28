// app/page.js
// Simple home page with call form. Uses client-side for form, server action for initiation.

'use client';

import { useState } from 'react';
import { initiateCallAction } from '../src/domains/calls/actions/CallActions'; // Server action import
import CallForm from '../src/features/call-initiation/CallForm';

export default function Home() {
  const [message, setMessage] = useState('');

  const handleCall = async (formData) => {
    const result = await initiateCallAction(formData);
    setMessage(result.message || result.error);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md">
        <h1 className="text-2xl mb-4">Test Twilio Call to OpenAI Realtime</h1>
        <CallForm onSubmit={handleCall} />
        {message && <p className="mt-4 text-center">{message}</p>}
      </div>
    </div>
  );
}
