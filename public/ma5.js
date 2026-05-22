import { initMaStrategy } from './ma10.js';

function init() {
  return initMaStrategy({
    period: 5,
    lineLabel: '五日线'
  });
}

export { init };
