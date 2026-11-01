import type { Findings } from './findings.js';
export * from './findings.js';
export type SearchType = 'username' | 'email' | 'phone' | 'image';
export type Source = 'predicta' | 'osintindustry' | 'epieos' | 'behindtheemail' | 'findpiclocation' | 'geoseer' | 'facecheck' | 'camgirlfinder' | 'tineye';
export type SearchInput = ({ type: 'username' | 'email' | 'phone'; query: string; value?: never } | { type: 'username' | 'email' | 'phone'; value: string; query?: never } | { type: 'image'; image: string; value?: never } | { type: 'image'; value: string; image?: never }) & { sources?: Source[] };
export interface RequestOptions { signal?: AbortSignal; requestTimeoutMs?: number; maxRetries?: number }
export interface WaitOptions extends RequestOptions { timeoutMs?: number; pollIntervalMs?: number; onProgress?: (response: Response<SearchResult>) => void | Promise<void> }
export interface Response<T> { data: T; meta: { status: number; requestId: string | null; retryAfterMs: number | null } }
export interface SourceStatus { status: 'pending' | 'running' | 'completed' | 'failed'; found?: boolean; partial?: boolean; reason?: string; error?: { code: string; provider_status?: number } }
/** Normalized records retain provider attributes and future API fields. */
export interface SearchResult {
  ref: string; status: SourceStatus['status']; type: SearchType; query?: string;
  sources: Record<string, SourceStatus>;
  results: Findings;
  [field: string]: unknown;
}
export interface Cost { cost: number; balance: number; type: SearchType; sources: string[] }
export interface Health { status: 'pass' | 'warn' | 'fail'; version: string; time: string; search_service: { status: 'up' | 'down' }; sources: Record<string, { status: 'up' | 'down' | 'disabled' | 'unknown'; types: SearchType[]; checked_at: string | null }> }
export interface PreparedSnapshot { body: { type: SearchType; query?: string; image?: string; sources?: string[]; key: string }; idempotencyKey: string; createdAt: number }
export interface HandleSnapshot { ref: string; key: string; pollAfter?: number }
export class PreparedSearch {
  constructor(snapshot: PreparedSnapshot);
  /** Sensitive: store securely, never log. */
  export(): PreparedSnapshot;
  toJSON(): { type: SearchType; secrets: string };
}
export class SearchHandle {
  constructor(snapshot: HandleSnapshot);
  readonly ref: string;
  /** Sensitive: store securely, never log. */
  export(): HandleSnapshot;
  toJSON(): { ref: string; key: string };
}
export class UserSearchError extends Error {
  constructor(message: string, details?: Record<string, unknown>);
  toJSON(): Record<string, unknown>;
  hint: string; response?: Response<SearchResult>; jobId?: string;
  code?: string; status?: number; requestId?: string | null; retryAfterMs?: number | null;
  charged?: boolean | null; problem?: Record<string, unknown>; prepared?: PreparedSearch; handle?: SearchHandle;
}
export class AuthenticationError extends UserSearchError {}
export class PermissionError extends UserSearchError {}
export class InvalidRequestError extends UserSearchError {}
export class RateLimitError extends UserSearchError {}
export class APIError extends UserSearchError {}
export class ConnectionError extends UserSearchError {}
export class DeliveryUncertainError extends UserSearchError {}
export const VERSION: string;
export interface ResultStore {
  load(id: string): Promise<unknown>;
  save(id: string, response: unknown): Promise<void>;
  withLock<T>(id: string, operation: () => Promise<T>): Promise<T>;
}
export class EncryptedFileStore implements ResultStore {
  constructor(options: { directory: string; encryptionKey: Uint8Array });
  load(id: string): Promise<unknown>;
  save(id: string, response: unknown): Promise<void>;
  withLock<T>(id: string, operation: () => Promise<T>): Promise<T>;
}
export interface ClientOptions { apiKey: string; baseUrl?: string; fetch?: typeof globalThis.fetch; timeoutMs?: number; maxRetries?: number; resultStore?: ResultStore }
export class UserSearch {
  constructor(options: ClientOptions);
  prepare(input: SearchInput): PreparedSearch;
  health(options?: RequestOptions): Promise<Response<Health>>;
  balance(options?: RequestOptions): Promise<Response<{ balance: number }>>;
  cost(input: SearchInput, options?: RequestOptions): Promise<Response<Cost>>;
  submit(prepared: PreparedSearch, options?: RequestOptions): Promise<Response<{ ref: string; status: 'pending'; type: SearchType; sources: string[]; results_url: string }> & { handle: SearchHandle }>;
  results(handle: SearchHandle, options?: RequestOptions): Promise<Response<SearchResult>>;
  wait(handle: SearchHandle, options?: WaitOptions): Promise<Response<SearchResult>>;
  search(input: SearchInput, options?: WaitOptions): Promise<Response<SearchResult>>;
  runJob(jobId: string, input?: SearchInput, options?: WaitOptions): Promise<Response<SearchResult>>;
}
export default UserSearch;
