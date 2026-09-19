export type { Weighted } from './simple.js';
export {
  sma,
  smaStep,
  smaTail,
  swma,
  swmaStep,
  swmaTail,
  vwma,
  vwmaStep,
  vwmaTail,
  wma,
  wmaStep,
  wmaTail,
} from './simple.js';

export {
  dema,
  demaStep,
  demaTail,
  ema,
  emaStep,
  emaTail,
  rma,
  rmaStep,
  rmaTail,
  tema,
  temaStep,
  temaTail,
} from './exponential.js';

export { alma, almaTail, hma, hmaStep, hmaTail, linreg, linregTail } from './shaped.js';

export type { MaType } from './select.js';
export { ma, maTail } from './select.js';
