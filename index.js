import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { UserSearchError, ConnectionError, DeliveryUncertainError, apiError } from './errors.js';
import { VERSION } from './version.js';
export { VERSION } from './version.js';
export { UserSearchError, AuthenticationError, PermissionError, InvalidRequestError, RateLimitError, APIError, ConnectionError, DeliveryUncertainError } from './errors.js';
export { EncryptedFileStore } from './store.js';
import { setTimeout as delay } from 'node:timers/promises';

const TYPES = ['username', 'email', 'phone', 'image'];
const terminal = data => ['completed', 'failed'].includes(data.status);
const states = new WeakMap();
const preparations = new WeakMap();
const MAX_AGE = 23 * 60 * 60 * 1000;
function recover(error, field, value) {
  if (!(error instanceof Error) || !Object.isExtensible(error)) error = new UserSearchError('Operation interrupted.', { code: 'OPERATION_INTERRUPTED' });
  Object.defineProperty(error, field, { value, enumerable: false, configurable: true });
  return error;
}

function positive(value, name, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 2147483647)
    throw new TypeError(`${name} must be a ${allowZero ? 'nonnegative' : 'positive'} integer <= 2147483647`);
  return value;
}

function inputBody(input) {
  if (!input || !TYPES.includes(input.type)) throw new TypeError('type must be username, email, phone or image');
  const field = input.type === 'image' ? 'image' : 'query';
  const value = input[field] ?? input.value;
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a nonempty string`);
  if (input[field] !== undefined && input.value !== undefined && input[field] !== input.value)
    throw new TypeError('value and query/image disagree');
  const body = { type: input.type, [field]: value };
  if (input.sources !== undefined) {
    if (!Array.isArray(input.sources) || !input.sources.length || input.sources.some(s => typeof s !== 'string' || !/^[a-z][a-z0-9_]*$/.test(s)))
      throw new TypeError('sources must be a nonempty array of source names; omit it for API defaults');
    body.sources = [...new Set(input.sources)];
  }
  return body;
}

function validateKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key) || Buffer.from(key, 'base64url').toString('base64url') !== key)
    throw new TypeError('Invalid result key: expected canonical base64url of 32 random bytes');
}

export class PreparedSearch {
  constructor(snapshot) {
    const body = inputBody(snapshot.body);
    validateKey(snapshot.body.key);
    if (!/^[\x21-\x7e]{1,255}$/.test(snapshot.idempotencyKey ?? '')) throw new TypeError('Invalid idempotency key');
    if (!Number.isFinite(snapshot.createdAt) || snapshot.createdAt > Date.now()) throw new TypeError('Invalid preparation timestamp');
    body.key = snapshot.body.key;
    preparations.set(this, { body, idempotencyKey: snapshot.idempotencyKey, createdAt: snapshot.createdAt });
    Object.freeze(this);
  }
  export() { return structuredClone(preparations.get(this)); }
  toJSON() { return { type: preparations.get(this).body.type, secrets: '[redacted]' }; }
}

export class SearchHandle {
  constructor(snapshot) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(snapshot.ref ?? '')) throw new TypeError('Invalid search ref');
    validateKey(snapshot.key);
    if (snapshot.pollAfter !== undefined && (!Number.isSafeInteger(snapshot.pollAfter) || snapshot.pollAfter < 0)) throw new TypeError('Invalid pollAfter timestamp');
    states.set(this, { ref: snapshot.ref, key: snapshot.key, pollAfter: snapshot.pollAfter ?? 0, cached: undefined, inFlight: undefined });
    Object.freeze(this);
  }
  get ref() { return states.get(this).ref; }
  export() { const { ref, key, pollAfter } = states.get(this); return { ref, key, pollAfter }; }
  toJSON() { return { ref: this.ref, key: '[redacted]' }; }
}

function retryAfter(response, data) {
  const header = response.headers.get('retry-after');
  let ms = header === null ? NaN : /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms) && Number.isFinite(data?.retry_after)) ms = data.retry_after * 1000;
  return Number.isFinite(ms) ? Math.max(0, ms) : null;
}

export class UserSearch {
  #apiKey; #base; #fetch; #timeout; #retries; #store;
  constructor({ apiKey, baseUrl = 'https://public-api.usersearch.ai', fetch: fetchImpl = globalThis.fetch, timeoutMs = 30000, maxRetries = 2, resultStore } = {}) {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new TypeError('apiKey is required');
    const url = new URL(baseUrl);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new TypeError('baseUrl must be an origin without a path or credentials');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      throw new TypeError('baseUrl requires HTTPS (HTTP allowed only for loopback tests)');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch must be a function');
    this.#apiKey = apiKey; this.#base = url.origin; this.#fetch = fetchImpl;
    this.#timeout = positive(timeoutMs, 'timeoutMs'); this.#retries = positive(maxRetries, 'maxRetries', true);
    if (resultStore && ['load', 'save', 'withLock'].some(method => typeof resultStore[method] !== 'function')) throw new TypeError('resultStore requires load, save and withLock methods');
    this.#store = resultStore;
  }
  prepare(input) {
    return new PreparedSearch({ body: { ...inputBody(input), key: randomBytes(32).toString('base64url') }, idempotencyKey: randomUUID(), createdAt: Date.now() });
  }
  async #request(path, { method = 'GET', body, headers, signal, maxRetries = this.#retries, requestTimeoutMs = this.#timeout, collecting = false, health = false, expiresAt } = {}) {
    positive(maxRetries, 'maxRetries', true); positive(requestTimeoutMs, 'requestTimeoutMs');
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      if (expiresAt !== undefined && Date.now() >= expiresAt)
        throw new UserSearchError('The original idempotency window has expired; reconcile the original search before resubmitting.', { code: 'PREPARATION_EXPIRED', charged: null });
      let response, data, error;
      const requestSignal = AbortSignal.any([AbortSignal.timeout(requestTimeoutMs), ...(signal ? [signal] : [])]);
      try {
        response = await this.#fetch(this.#base + path, {
          method, body: serialized, redirect: 'error', signal: requestSignal,
          headers: { Accept: 'application/json, application/problem+json, application/health+json', 'User-Agent': `usersearch-sdk/${VERSION}`, 'X-API-Key': this.#apiKey, ...(serialized ? { 'Content-Type': 'application/json' } : {}), ...headers }
        });
        const raw = await response.text();
        try { data = JSON.parse(raw); } catch { throw new Error('Invalid JSON response'); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid JSON object response');
      } catch {
        const ErrorType = collecting ? DeliveryUncertainError : ConnectionError;
        error = new ErrorType(collecting ? 'Result delivery is uncertain; the API may have consumed its read-once response.' : 'Request failed before a usable response was received.', {
          code: collecting ? 'DELIVERY_UNCERTAIN' : 'TRANSPORT_ERROR', charged: null,
          status: response?.status, requestId: response?.headers.get('x-request-id') ?? null
        });
      }
      if (!error) {
        const meta = { status: response.status, requestId: response.headers.get('x-request-id'), retryAfterMs: retryAfter(response, data) };
        const mediaType = response.headers.get('content-type')?.split(';')[0].trim();
        const healthFailure = health && response.status === 503 && ['application/json', 'application/health+json'].includes(mediaType)
          && data.status === 'fail' && data.search_service?.status === 'down' && !data.code;
        if (response.ok || healthFailure)
          return { data, meta };
        error = apiError(typeof data.detail === 'string' ? data.detail : `API returned HTTP ${response.status}`, {
          code: data.code ?? 'HTTP_ERROR', status: response.status, requestId: meta.requestId, retryAfterMs: meta.retryAfterMs,
          charged: data.charged ?? null, problem: data
        });
      }
      const transient = error.code === 'TRANSPORT_ERROR' || [429, 500, 502, 503, 504].includes(error.status);
      if (signal?.aborted || collecting || !transient || attempt >= maxRetries) throw error;
      const wait = error.retryAfterMs ?? Math.min(1000 * 2 ** attempt, 10000);
      // Do not shorten a server-requested delay or overflow Node's timer.
      if (wait > 2147483647 || (expiresAt !== undefined && Date.now() + wait >= expiresAt)) throw error;
      await delay(wait, undefined, { signal });
    }
  }
  health(options = {}) { return this.#request('/v1/health', { ...requestOptions(options), health: true }); }
  balance(options = {}) { return this.#request('/v1/balance', requestOptions(options)); }
  cost(input, options = {}) { return this.#request('/v1/cost', { ...requestOptions(options), method: 'POST', body: inputBody(input) }); }
  async submit(prepared, options = {}) {
    if (!(prepared instanceof PreparedSearch)) throw new TypeError('submit requires a PreparedSearch from prepare()');
    const snapshot = prepared.export();
    if (Date.now() - snapshot.createdAt >= MAX_AGE) throw new UserSearchError('Preparation exceeds the 23-hour idempotency window; reconcile the original search before starting another.', { code: 'PREPARATION_EXPIRED', prepared });
    try {
      const response = await this.#request('/v1/search/submit', { ...requestOptions(options), method: 'POST', body: snapshot.body, headers: { 'Idempotency-Key': snapshot.idempotencyKey }, expiresAt: snapshot.createdAt + MAX_AGE });
      const handle = new SearchHandle({ ref: response.data.ref, key: snapshot.body.key, pollAfter: Date.now() + (response.meta.retryAfterMs ?? 0) });
      return { ...response, handle };
    } catch (error) { throw recover(error, 'prepared', prepared); }
  }
  async results(handle, options = {}) {
    if (!(handle instanceof SearchHandle)) throw new TypeError('results requires a SearchHandle');
    const state = states.get(handle);
    if (state.owner && state.owner !== this) throw new UserSearchError('This in-memory handle belongs to another client. Restore a new SearchHandle from its exported snapshot.', { code: 'HANDLE_CLIENT_MISMATCH' });
    state.owner = this;
    if (state.cached && !this.#store) return structuredClone(state.cached);
    if (state.inFlight) return structuredClone(await state.inFlight);
    const collect = async () => {
      try {
        const id = createHash('sha256').update(JSON.stringify([this.#base, this.#apiKey, state.ref, state.key])).digest('hex');
        const perform = async () => {
        const saved = this.#store ? await this.#store.load(id) : undefined;
        if (saved) {
          if (saved.data?.ref !== state.ref || !terminal(saved.data)) throw new Error('Invalid stored terminal response');
          state.cached = structuredClone(saved); return saved;
        }
        const persist = async response => {
          try { await this.#store?.save(id, structuredClone(response)); }
          catch {
            const error = new UserSearchError('Results received but could not be saved. Retry results() on this handle to save the cached copy.', { code: 'RESULT_SAVE_FAILED' });
            Object.defineProperty(error, 'response', { value: structuredClone(response), enumerable: false });
            throw error;
          }
        };
        if (state.cached) { await persist(state.cached); return structuredClone(state.cached); }
        const firstDelay = Math.max(0, state.pollAfter - Date.now());
        if (firstDelay > 2147483647) throw new UserSearchError('Polling delay exceeds the supported timer range.', { code: 'RETRY_DELAY_TOO_LONG' });
        if (firstDelay) await delay(firstDelay, undefined, { signal: options.signal });
        const response = await this.#request(`/v1/search/results?ref=${encodeURIComponent(state.ref)}`, { ...requestOptions(options), headers: { 'X-Result-Key': state.key }, collecting: true });
        if (!['pending', 'running', 'completed', 'failed'].includes(response.data.status) || response.data.ref !== state.ref)
          throw new DeliveryUncertainError('Unexpected result response; delivery may have been consumed.', { code: 'DELIVERY_UNCERTAIN' });
        if (terminal(response.data)) {
          state.cached = structuredClone(response);
          await persist(response);
        }
        return response;
        };
        return await (this.#store ? this.#store.withLock(id, perform) : perform());
      } catch (error) { throw recover(error, 'handle', handle); }
    };
    state.inFlight = collect();
    try { return structuredClone(await state.inFlight); } finally { state.inFlight = undefined; }
  }
  async wait(handle, { signal, timeoutMs = 300000, pollIntervalMs = 5000, onProgress, requestTimeoutMs } = {}) {
    positive(timeoutMs, 'timeoutMs'); positive(pollIntervalMs, 'pollIntervalMs');
    if (onProgress !== undefined && typeof onProgress !== 'function') throw new TypeError('onProgress must be a function');
    const combined = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
    try {
      for (;;) {
        combined.throwIfAborted();
        let response;
        try { response = await this.results(handle, { signal: combined, requestTimeoutMs }); }
        catch (error) {
          // Only an explicit structured rate-limit rejection is retried during collection.
          if (error.status !== 429 || error.code !== 'RATE_LIMITED') throw error;
          const ms = Math.max(pollIntervalMs, error.retryAfterMs ?? 0);
          if (ms > 2147483647) throw error;
          await delay(ms, undefined, { signal: combined });
          continue;
        }
        if (onProgress) await onProgress(structuredClone(response));
        if (terminal(response.data)) return response;
        const ms = Math.max(pollIntervalMs, response.meta.retryAfterMs ?? 0);
        if (ms > 2147483647) throw new UserSearchError('Server requested a polling delay beyond the supported timer range.', { code: 'RETRY_DELAY_TOO_LONG' });
        await delay(ms, undefined, { signal: combined });
      }
    } catch (error) { throw recover(error, 'handle', handle); }
  }
  async runJob(jobId, input, options = {}) {
    validateWaitOptions(options);
    if (!this.#store) throw new TypeError('runJob requires a resultStore for durable recovery');
    if (typeof jobId !== 'string' || !jobId.trim() || jobId.length > 255) throw new TypeError('jobId must be 1–255 characters');
    const id = 'job:' + createHash('sha256').update(JSON.stringify([this.#base, this.#apiKey, jobId])).digest('hex');
    try {
      return await this.#store.withLock(id, async () => {
        options.signal?.throwIfAborted();
        let job = await this.#store.load(id);
        if (!job) {
          if (!input) throw new UserSearchError('Job not found; supply input to create it.', { code: 'JOB_NOT_FOUND' });
          job = { version: 1, input: inputBody(input), prepared: this.prepare(input).export() };
          await this.#store.save(id, job); // Must succeed before the first chargeable request.
        }
        if (job.version !== 1 || !job.prepared) throw new Error('Invalid stored job');
        if (input && JSON.stringify(inputBody(input)) !== JSON.stringify(job.input))
          throw new UserSearchError('This job ID belongs to a different input. Resume without changing the input.', { code: 'JOB_INPUT_CONFLICT' });
        if (job.response) return structuredClone(job.response);
        let handle;
        if (job.handle) handle = new SearchHandle(job.handle);
        else {
          ({ handle } = await this.submit(new PreparedSearch(job.prepared), requestOptions(options)));
          job.handle = handle.export();
          await this.#store.save(id, job); // Persist acceptance before attempting read-once collection.
        }
        const response = await this.wait(handle, options);
        job.response = response;
        await this.#store.save(id, job);
        return response;
      });
    } catch (error) { throw recover(error, 'jobId', jobId); }
  }
  async search(input, options = {}) {
    validateWaitOptions(options);
    const prepared = this.prepare(input);
    const { handle } = await this.submit(prepared, requestOptions(options));
    return this.wait(handle, options);
  }
}

function requestOptions({ signal, maxRetries, requestTimeoutMs }) {
  return { signal, maxRetries, requestTimeoutMs };
}

function validateWaitOptions({ timeoutMs = 300000, pollIntervalMs = 5000, onProgress }) {
  positive(timeoutMs, 'timeoutMs'); positive(pollIntervalMs, 'pollIntervalMs');
  if (onProgress !== undefined && typeof onProgress !== 'function') throw new TypeError('onProgress must be a function');
}

export default UserSearch;
