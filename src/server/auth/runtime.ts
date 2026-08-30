import { LoginThrottle } from './login-throttle.ts';

/** One process-wide valve; endpoint module boundaries must not create one each. */
export const productionLoginThrottle = new LoginThrottle();
