'use strict';

const { EventEmitter } = require('events');

const socialEvents = new EventEmitter();
socialEvents.setMaxListeners(100);

function emitSocialEvent(type, payload = {}) {
  socialEvents.emit('social-event', {
    type,
    payload,
    at: new Date().toISOString(),
  });
}

module.exports = {
  socialEvents,
  emitSocialEvent,
};