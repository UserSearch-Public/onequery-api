const guidance = {
  KEY_NOT_ACTIVATED: 'Activate this API key through UserSearch support before searching.',
  IP_NOT_SET: 'Register your server outbound public IP under Settings > API.',
  IP_NOT_ALLOWED: 'Check the registered outbound IP, including IPv4/IPv6 and proxies. Collection uses the IP lock at submission.',
  INVALID_API_KEY: 'Check the server environment key. For existing searches, use the original submission key.',
  INSUFFICIENT_CREDITS: 'Top up credits or choose fewer sources, then check cost again.',
  SOURCE_UNAVAILABLE: 'Wait for the named source or explicitly select other sources and obtain a fresh quote.',
  SUBSCRIPTION_REQUIRED: 'An active subscription is required for searches.',
  DELIVERY_UNCERTAIN: 'Check saved results first. Do not start another paid search automatically; the terminal response may have been consumed.',
  RESULTS_DELETED: 'Look in your saved results. The API no longer holds this result.',
  RATE_LIMITED: 'Wait for Retry-After before retrying.',
  TRANSPORT_ERROR: 'For submissions, retry error.prepared with the same keys; do not start a replacement search.'
};

export class UserSearchError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = new.target.name;
    Object.assign(this, details);
    this.hint = guidance[this.code] ?? 'Use the request ID when contacting support.';
  }
  // Safe diagnostics: omit queries, server detail text, response bodies and recovery secrets.
  toJSON() {
    return { name: this.name, code: this.code, status: this.status, requestId: this.requestId,
      retryAfterMs: this.retryAfterMs, charged: this.charged, hint: this.hint };
  }
}
export class AuthenticationError extends UserSearchError {}
export class PermissionError extends UserSearchError {}
export class InvalidRequestError extends UserSearchError {}
export class RateLimitError extends UserSearchError {}
export class APIError extends UserSearchError {}
export class ConnectionError extends UserSearchError {}
export class DeliveryUncertainError extends UserSearchError {}

export function apiError(message, details) {
  const status = details.status;
  const ErrorType = status === 401 ? AuthenticationError : status === 403 ? PermissionError
    : status === 429 ? RateLimitError : status >= 400 && status < 500 ? InvalidRequestError : APIError;
  return new ErrorType(message, details);
}
