import { initTurnMaStrategy } from './ma10-turn.js';

function init() {
  return initTurnMaStrategy({
    period: 5,
    lineLabel: '五日线'
  });
}

export { init };
