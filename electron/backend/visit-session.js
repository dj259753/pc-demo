'use strict';

class VisitSessionController {
  constructor(socialClient) {
    this.socialClient = socialClient;
  }

  createRoom(params = {}) {
    return this.socialClient.createVisitRoom(params);
  }

  leaveRoom(reason = 'manual-leave') {
    return this.socialClient.leaveVisitRoom({ reason });
  }

  getCurrentRoom() {
    return this.socialClient.getCurrentRoom();
  }
}

module.exports = {
  VisitSessionController,
};