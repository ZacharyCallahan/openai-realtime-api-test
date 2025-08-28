// src/domains/calls/entities/Call.js
// Entity class: Represents a call's data structure (like a simple object with props).
// In DDD, entities hold core business data (e.g., id, from/to numbers).

export class Call {
    constructor({ id, from, to, status = 'pending' }) {
        this.id = id || Date.now().toString(); // Temp ID for test
        this.from = from;
        this.to = to;
        this.status = status;
    }
}
