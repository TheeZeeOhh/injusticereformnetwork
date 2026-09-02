import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

let requestCounter = 0;
const pendingRequests = new Map();

// Initialize the listener once
let listenerInitialized = false;

async function initListener() {
  if (listenerInitialized || typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return;
  listenerInitialized = true;
  await listen('zee-bridge-response', (event) => {
    const res = event.payload || {};
    const id = res.id;
    if (id && pendingRequests.has(id)) {
      const { resolve, reject, onToken } = pendingRequests.get(id);
      
      if (res.type === 'token') {
        if (onToken && typeof onToken === 'function') {
          onToken(res.text);
        }
      } else if (res.type === 'result') {
        resolve(res.value);
        pendingRequests.delete(id);
      } else if (res.type === 'error') {
        reject(new Error(res.message));
        pendingRequests.delete(id);
      }
    }
  });
}

async function sendRequest(method, params = {}, onToken = null) {
  await initListener();
  
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) {
    throw new Error('Not running in Tauri');
  }

  const id = String(++requestCounter);
  const req = { id, method, params };
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject, onToken });
    invoke('zee_bridge_request', { request: req }).catch(err => {
      pendingRequests.delete(id);
      reject(err);
    });
  });
}

export async function ping() {
  return sendRequest('ping');
}

export async function getModels() {
  return sendRequest('models');
}

export async function getMetrics() {
  return sendRequest('metrics');
}

export async function chat(prompt, opts = {}) {
  const { model, onToken } = opts;
  return sendRequest('chat', { prompt, model, stream: !!onToken }, onToken);
}

export async function recall(query = '', k = 5) {
  return sendRequest('recall', { query, k });
}

export async function remember(text = '', kind = 'note') {
  return sendRequest('remember', { text, kind });
}
