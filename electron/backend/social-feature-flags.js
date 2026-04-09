'use strict';

const DEFAULT_FEATURE_FLAGS = Object.freeze({
  socialEnabled: true,
  visitModeEnabled: true,
  dualActionEnabled: false,
  miniGameEnabled: true,
  photoCardEnabled: false,
  leaveNoteEnabled: false,
  socialRemoteEnabled: false,
});

function resolveFeatureFlags(patch = {}) {
  return {
    ...DEFAULT_FEATURE_FLAGS,
    ...(patch && typeof patch === 'object' ? patch : {}),
  };
}

module.exports = {
  DEFAULT_FEATURE_FLAGS,
  resolveFeatureFlags,
};