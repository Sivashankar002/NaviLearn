/**
 * Centralized API fetch utility.
 *
 * Every HTTP call in the application flows through this single function,
 * which handles:
 *   1. Base URL resolution via config.js
 *   2. JWT token injection from localStorage
 *   3. Content-Type headers for JSON bodies
 *   4. Response parsing (JSON)
 *   5. Status-code-specific, user-friendly error messages
 *   6. Network error detection (no internet / server down)
 *
 * Usage:
 *   import { apiFetch } from '../utils/api';
 *
 *   // GET (default)
 *   const courses = await apiFetch('/api/courses');
 *
 *   // POST with JSON body
 *   await apiFetch('/api/courses', {
 *     method: 'POST',
 *     body: JSON.stringify({ title: 'New Course' }),
 *   });
 *
 *   // Unauthenticated call (login / register)
 *   const data = await apiFetch('/api/auth/login', {
 *     method: 'POST',
 *     body: JSON.stringify({ email, password }),
 *     skipAuth: true,
 *   });
 */

import config from '../config';

// ── Human-readable messages keyed by HTTP status code ──────────────────────
const STATUS_MESSAGES = {
  401: 'Your session has expired. Please log in again.',
  403: 'You do not have permission to access this resource.',
  404: 'The requested resource was not found.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'An internal server error occurred. Please try again later.',
  502: 'The server is temporarily unavailable. Please try again in a few minutes.',
  503: 'The server is temporarily unavailable. Please try again in a few minutes.',
};

// ── Shared promise variables for silent token refresh ──────────────────────
let refreshPromise = null;

async function performTokenRefresh() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(`${config.API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: refreshToken }),
  });

  if (!response.ok) {
    throw new Error('Refresh token invalid or expired');
  }

  const data = await response.json();
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  return data.accessToken;
}

/**
 * @param {string}  path     – API path starting with / (e.g. '/api/courses')
 * @param {Object}  options  – Standard fetch options + custom `skipAuth` flag
 * @returns {Promise<any>}   – Parsed JSON response body
 * @throws {Error}           – With user-friendly message on failure
 */
export async function apiFetch(path, options = {}) {
  // Destructure our custom flag out; pass everything else to native fetch
  const { skipAuth = false, ...fetchOptions } = options;

  // ── Build headers ──────────────────────────────────────────────────────
  const headers = { ...fetchOptions.headers };

  // Attach JWT unless this is a public endpoint (login/register)
  if (!skipAuth) {
    const token = localStorage.getItem('accessToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Auto-set Content-Type for JSON bodies
  if (fetchOptions.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // ── Execute request ────────────────────────────────────────────────────
  let response;
  try {
    response = await fetch(`${config.API_URL}${path}`, {
      ...fetchOptions,
      headers,
    });
  } catch (err) {
    // Network-level failure — request never reached the server
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      throw new Error('Unable to connect to the server. Check your internet connection.');
    }
    throw err;
  }

  // ── Handle error responses ─────────────────────────────────────────────
  if (!response.ok) {
    // Intercept 401 Unauthorized for expired access tokens
    if (response.status === 401 && !skipAuth) {
      try {
        if (!refreshPromise) {
          refreshPromise = performTokenRefresh().finally(() => {
            refreshPromise = null;
          });
        }

        const newAccessToken = await refreshPromise;

        // Retry the original request with the new access token
        headers['Authorization'] = `Bearer ${newAccessToken}`;
        response = await fetch(`${config.API_URL}${path}`, {
          ...fetchOptions,
          headers,
        });
      } catch (refreshErr) {
        console.error('Silent token refresh failed:', refreshErr);
        // Clear local storage to log out user
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        
        // Redirect to login page
        window.location.href = '/login';
        throw new Error('Your session has expired. Please log in again.');
      }
    }
  }

  // If retried request (or original request) is still not OK:
  if (!response.ok) {
    // Try to read the backend's JSON error body (e.g. { message: "..." })
    let serverMessage;
    try {
      const errorBody = await response.json();
      serverMessage = errorBody.message || errorBody.error;
    } catch {
      // Response wasn't JSON (e.g. HTML 502 from reverse proxy)
      serverMessage = null;
    }

    throw new Error(
      serverMessage || STATUS_MESSAGES[response.status] || `Request failed with status ${response.status}`
    );
  }

  // ── Parse successful response ──────────────────────────────────────────
  // Some endpoints (DELETE 204) may return no body
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return null;
}
