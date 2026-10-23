import { ADMIN_PAGE_SIZE } from '../core/state.js';

export const admin = {
  authenticated: false,
  sessionChecked: false,
  sessionPromise: null,
  username: '',
  trackQuery: '',
  trackLimit: ADMIN_PAGE_SIZE
};
