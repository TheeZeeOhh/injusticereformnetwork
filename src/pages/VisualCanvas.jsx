import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { loadSecureRecord, saveSecureRecord } from '../utils/storageEngine';

// Visual Canvas — a real, offline, draggable note-node board for mapping case
// timelines and evidence threads. Nodes can be added, dragged, edited inline,
// and deleted. The board persists encrypted in the local vault (Vault A).
//
// Scope note: this is an honest sticky-note/whiteboard, NOT a full vector editor
// (no freehand drawing / shapes) — those were removed rather than faked.
const GLOBAL_BOARD_ID = 'canvas_board';

// Reusable board. `boardId` selects which encrypted vault record it reads/writes,
// so the standalone page and each client chart can hold independent boards.
export function CanvasBoard({ boardId = GLOBAL_BOARD_ID }) {
  const { vaultAKey } = useAuthStore();
  const [nodes, setNodes] = useState([]);
  const [status, setStatus] = useState('');
  const dragState = useRef(null); // { id, offsetX, offsetY }
  const boardRef = useRef(null);
  // Mirror of the latest nodes so drag-end / blur saves the CURRENT positions,
  // not the stale array captured by the handler's closure.
  const nodesRef = useRef([]);
  nodesRef.current = nodes;

  const vaultOpen = !!vaultAKey;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus('');
      if (!vaultAKey) { setNodes([]); return; }
      try {
        const stored = await loadSecureRecord(vaultAKey, boardId, 'A');
        if (!cancelled) setNodes(Array.isArray(stored) ? stored : []);
      } catch {
        if (!cancelled) { setNodes([]); setStatus('Could not decrypt the saved board.'); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [vaultAKey, boardId]);

  const persist = async (next) => {
    setNodes(next);
    if (!vaultAKey) return;
    try {
      await saveSecureRecord(vaultAKey, boardId, next, 'A');
    } catch (err) {
      setStatus('Save failed: ' + err.message);
    }
  };

  // Persist whatever is currently in nodesRef (used after drag / on blur).
  const persistCurrent = () => persist(nodesRef.current);

  const addNode = () => {
    const id = `n-${Date.now()}`;
    const next = [...nodes, { id, x: 80 + (nodes.length * 24) % 300, y: 80 + (nodes.length * 24) % 200, text: 'New note…', color: '#e2552b' }];
    persist(next);
  };

  const updateText = (id, text) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, text } : n));
  };

  const removeNode = (id) => {
    persist(nodes.filter((n) => n.id !== id));
  };

  const onMouseDown = (e, node) => {
    // Don't start a drag when interacting with the textarea/delete control.
    if (e.target.tagName === 'TEXTAREA' || e.target.dataset.role === 'del') return;
    const boardRect = boardRef.current.getBoundingClientRect();
    dragState.current = {
      id: node.id,
      offsetX: e.clientX - boardRect.left - node.x,
      offsetY: e.clientY - boardRect.top - node.y
    };
  };

  const onMouseMove = (e) => {
    if (!dragState.current) return;
    const boardRect = boardRef.current.getBoundingClientRect();
    const { id, offsetX, offsetY } = dragState.current;
    const x = Math.max(0, e.clientX - boardRect.left - offsetX);
    const y = Math.max(0, e.clientY - boardRect.top - offsetY);
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, x, y } : n));
  };

  const onMouseUp = () => {
    if (dragState.current) {
      dragState.current = null;
      // Persist final positions once the drag ends (from the live ref).
      persistCurrent();
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button onClick={addNode} disabled={!vaultOpen} className="btn-primary" style={{ background: 'var(--ember)', color: 'white', fontWeight: 'bold', opacity: vaultOpen ? 1 : 0.5 }}>
          + Add Note
        </button>
      </div>

      {!vaultOpen && (
        <div style={{ background: 'rgba(225, 29, 72, 0.12)', borderLeft: '4px solid #e11d48', padding: '1rem', color: '#fda4af', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
          🔒 Log in to create and save a board.
        </div>
      )}

      <div
        ref={boardRef}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        className="glass-panel"
        style={{ flex: 1, minHeight: '360px', position: 'relative', overflow: 'hidden', background: '#111', backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      >
        {nodes.map((node) => (
          <div
            key={node.id}
            onMouseDown={(e) => onMouseDown(e, node)}
            style={{ position: 'absolute', top: node.y, left: node.x, width: '200px', background: 'var(--charcoal-lighter)', border: `2px solid ${node.color}`, padding: '0.75rem', borderRadius: '8px', color: 'var(--bone)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', cursor: 'grab', userSelect: 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
              <span data-role="del" onClick={() => removeNode(node.id)} style={{ cursor: 'pointer', color: '#fda4af', fontSize: '0.9rem', lineHeight: 1 }}>✕</span>
            </div>
            <textarea
              value={node.text}
              onChange={(e) => updateText(node.id, e.target.value)}
              onBlur={persistCurrent}
              style={{ width: '100%', minHeight: '60px', background: 'transparent', border: 'none', color: 'var(--bone)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', resize: 'vertical', outline: 'none' }}
            />
          </div>
        ))}

        {nodes.length === 0 && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            Click "+ Add Note" to start mapping.
          </div>
        )}

        <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          Offline · encrypted to local vault
        </div>
      </div>

      {status && (
        <div style={{ fontSize: '0.8rem', color: '#4ade80', fontFamily: 'var(--font-mono)', background: '#020617', padding: '0.6rem', borderRadius: '4px' }}>
          {status}
        </div>
      )}
    </div>
  );
}

// Standalone page: a single global board under the app's Legal & Advocacy nav.
export default function VisualCanvas() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h1 style={{ color: 'var(--gold)', margin: 0, fontFamily: 'var(--font-serif)' }}>Visual Canvas</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', margin: 0 }}>
          Offline note board for case timelines and evidence threads. Drag to arrange; saved encrypted to your vault.
        </p>
      </div>
      <CanvasBoard boardId={GLOBAL_BOARD_ID} />
    </div>
  );
}
