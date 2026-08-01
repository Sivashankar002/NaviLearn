// ═══════════════════════════════════════════════════════════════════════════
// EVENT BUS — Decoupled cross-route communication channel
// ═══════════════════════════════════════════════════════════════════════════
//
// This module creates a single, shared EventEmitter instance that acts as
// a "message bus" between different parts of the server application.
//
// WHY A SEPARATE FILE?
// --------------------
// The learner routes (learner.js) and the admin analytics routes (courses.js)
// are two separate Express router modules. They cannot directly call each
// other's functions without creating a circular dependency. The Event Bus
// solves this by acting as a neutral intermediary:
//
//   learner.js  ──emits──►  eventBus  ──listens──►  courses.js
//
// Both files import eventBus independently, so there's no circular require().
//
// WHY EventEmitter?
// -----------------
// Node.js EventEmitter is an in-memory publish/subscribe system built into
// the Node.js core. It's lightweight (no external dependencies), synchronous
// within the same process, and perfect for single-server deployments.
//
// SCALING NOTE:
// If this app ever runs on multiple server instances (e.g., behind a load
// balancer), replace the EventEmitter below with a Redis Pub/Sub client.
// Because this is the ONLY file that defines the emitter, swapping it out
// requires changing ONLY this file — zero changes to learner.js or courses.js.
// ═══════════════════════════════════════════════════════════════════════════

const EventEmitter = require('events');
// ▲ Import the built-in Node.js EventEmitter class from the 'events' module.
//   This class provides the .on(), .emit(), and .removeListener() methods
//   that power the publish/subscribe pattern.

const eventBus = new EventEmitter();
// ▲ Create a SINGLE instance of EventEmitter.
//   Because Node.js caches the result of require() calls, every file that
//   does `require('./utils/eventBus')` will receive this EXACT same object.
//   This is what makes it a "singleton" — there is only one bus in the
//   entire application, ensuring all emitters and listeners talk to each other.

module.exports = eventBus;
// ▲ Export the singleton instance (not the class).
//   Any file that requires this module gets the live, shared eventBus object.
