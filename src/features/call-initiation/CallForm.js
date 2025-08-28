// src/features/call-initiation/CallForm.js
// UI component: Simple form for phone input.
// Uses action prop for server submission.

export default function CallForm({ onSubmit }) {
    return (
        <form action={onSubmit} className="space-y-4">
            <input
                type="text"
                name="toPhone"
                placeholder="Enter phone number (e.g., +1234567890)"
                className="w-full p-2 border rounded"
                required
            />
            <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded">
                Call
            </button>
        </form>
    );
}
