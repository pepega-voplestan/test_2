import React, { useState, useRef, useEffect, useMemo, useImperativeHandle } from 'react';
import { MentionUser } from '../types';
import { useMentionUsers } from '../hooks/useMentionUsers';
import { useAuth } from '../context/AuthContext';

export interface MentionInputHandle {
  clear(): void;
  focus(scrollIntoView?: boolean): void;
  insertText(text: string): void;
  insertMention(user: { id: string; name: string }): void;
  wrapSpoiler(): void;
}

export interface MentionInputProps {
  placeholder: string;
  disabled?: boolean;
  onContentChange: (serialized: string) => void;
  onSubmit: () => void;
  onImagePaste?: (file: File) => void;
  className?: string;
  size?: 'sm' | 'md';
}

// Exported so parents can compute the effective character count.
// Replaces @[name:id] with @name before counting so mentions don't inflate the budget.
export function effectiveLength(serialized: string, newlineCharCost: number): number {
  // Normalize mentions @[name:id] → @name, strip inline spoiler markers ||
  const normalized = serialized.replace(/@\[([^\]]+):[^\]]+\]/g, '@$1').replace(/\|\|/g, '');
  const newlines = (normalized.match(/\n/g) || []).length;
  return normalized.length + newlines * (newlineCharCost - 1);
}

interface MentionQuery {
  query: string;
  atNode: Text;
  atNodeOffset: number;
}

// Walk the contenteditable DOM and produce the serialized plain-text string.
// Mention spans are converted to @[name:id] tokens.
// \u00A0 (non-breaking spaces used after inserted mentions) become regular spaces.
function serializeContent(el: HTMLElement): string {
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
    }
    if (node.nodeName === 'BR') return '\n';
    if (node.nodeName === 'SPAN' && (node as HTMLElement).dataset.mentionId) {
      const e = node as HTMLElement;
      return `@[${e.dataset.mentionName}:${e.dataset.mentionId}]`;
    }
    // Spoiler spans: serialize back to ||content||
    if (node.nodeName === 'SPAN' && (node as HTMLElement).dataset.spoiler !== undefined) {
      const inner = Array.from(node.childNodes).map(walk).join('');
      return `||${inner}||`;
    }
    // Chrome wraps each new line in a <div>
    if (node.nodeName === 'DIV') {
      return '\n' + Array.from(node.childNodes).map(walk).join('');
    }
    return Array.from(node.childNodes).map(walk).join('');
  }

  const children = Array.from(el.childNodes);
  if (children.length === 0) return '';

  let result = '';
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    // First child <div> does not get a leading newline
    if (i === 0 && child.nodeName === 'DIV') {
      result += Array.from(child.childNodes).map(walk).join('');
    } else {
      result += walk(child);
    }
  }
  return result;
}

// Scan backwards from the caret to detect an active @mention query.
function detectMentionQuery(): MentionQuery | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;

  const container = range.startContainer;
  if (container.nodeType !== Node.TEXT_NODE) return null;

  const text = container.textContent ?? '';
  const cursorOffset = range.startOffset;
  const textBefore = text.slice(0, cursorOffset);

  let atIndex = -1;
  for (let i = textBefore.length - 1; i >= 0; i--) {
    const ch = textBefore[i];
    if (ch === '@') { atIndex = i; break; }
    if (ch === ' ' || ch === '\n' || ch === '\u00A0') break; // no mention trigger — stop
  }

  if (atIndex === -1) return null;

  // @ must be at the start of the text node or immediately after whitespace (including \u00A0 from inserted mentions)
  if (atIndex > 0) {
    const before = textBefore[atIndex - 1];
    if (before !== ' ' && before !== '\n' && before !== '\u00A0') return null;
  }

  const query = textBefore.slice(atIndex + 1);
  if (query.length > 32) return null;

  return { query, atNode: container as Text, atNodeOffset: atIndex };
}

function getCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  if (rect.top === 0 && rect.left === 0) return null;
  return rect;
}

// Inserts plain text at the current caret position inside a contenteditable element.
// Handles multi-line text (splits on \n → <br>). Dispatches a synthetic 'input' event
// so the React onInput handler picks up the change for serialization.
// `savedRange` is used to restore the caret when the editor had lost focus (e.g. after
// clicking the emoji picker).
function insertAtCursor(el: HTMLElement, text: string, savedRange?: Range | null): void {
  el.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (!sel) return;

  // Prefer savedRange when provided: Chrome often places the caret at position 0 when
  // re-focusing a contenteditable, so selectionInEditor alone is not a reliable guard.
  if (savedRange && el.contains(savedRange.startContainer)) {
    sel.removeAllRanges();
    sel.addRange(savedRange.cloneRange());
  } else {
    const selectionInEditor =
      sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer);
    if (!selectionInEditor) {
      // Fallback: place cursor at end
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  const range = sel.getRangeAt(0);
  range.deleteContents();

  // Build a fragment: split on newlines, insert <br> between lines
  const lines = text.split('\n');
  const frag = document.createDocumentFragment();
  lines.forEach((line, i) => {
    if (i > 0) frag.appendChild(document.createElement('br'));
    if (line) frag.appendChild(document.createTextNode(line));
  });

  const lastNode = frag.lastChild;
  range.insertNode(frag);

  // Move caret to after the inserted content
  if (lastNode) {
    const newRange = document.createRange();
    if (lastNode.nodeType === Node.TEXT_NODE) {
      newRange.setStart(lastNode, (lastNode as Text).length);
    } else {
      newRange.setStartAfter(lastNode);
    }
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  // Trigger React's onInput handler so serializeContent runs
  el.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

// Visually decorate ||text|| in the contenteditable with styled spoiler spans.
// Works by walking text nodes, finding ||...|| patterns, and replacing them with
// <span data-spoiler>content</span>. Preserves the caret position.
function decorateSpoilers(el: HTMLElement): void {
  const sel = window.getSelection();
  // Save caret as a text offset in the serialized string so we can restore after DOM mutation
  let caretOffset = -1;
  if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer)) {
    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(range.startContainer, range.startOffset);
    caretOffset = preRange.toString().length;
  }

  // Collect all text nodes that are NOT inside a mention span or already inside a spoiler span
  const textNodes: Text[] = [];
  function collectTextNodes(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text);
      return;
    }
    if (node.nodeName === 'SPAN') {
      const span = node as HTMLElement;
      if (span.dataset.mentionId || span.dataset.spoiler !== undefined) return; // skip
    }
    for (const child of Array.from(node.childNodes)) {
      collectTextNodes(child);
    }
  }
  collectTextNodes(el);

  const SPOILER_RE = /\|\|(.+?)\|\|/g;
  let mutated = false;

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    SPOILER_RE.lastIndex = 0;
    if (!SPOILER_RE.test(text)) continue;

    // Build replacement fragment
    SPOILER_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SPOILER_RE.exec(text)) !== null) {
      // Text before the match
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      // Spoiler span
      const span = document.createElement('span');
      span.dataset.spoiler = '';
      span.className = 'bg-th-text-4/30 rounded px-0.5';
      span.textContent = match[1]; // inner text without ||
      frag.appendChild(span);
      lastIndex = match.index + match[0].length;
    }
    // Remaining text after last match
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
    mutated = true;
  }

  if (!mutated) return;

  // Restore caret position by walking the DOM and counting characters
  if (caretOffset >= 0 && sel) {
    let remaining = caretOffset;
    function findOffset(node: Node): { node: Node; offset: number } | null {
      if (node.nodeType === Node.TEXT_NODE) {
        const len = (node.textContent ?? '').length;
        if (remaining <= len) return { node, offset: remaining };
        remaining -= len;
        return null;
      }
      if (node.nodeName === 'BR') {
        if (remaining === 0) return { node: node.parentNode!, offset: Array.from(node.parentNode!.childNodes).indexOf(node as ChildNode) };
        remaining -= 1;
        return null;
      }
      // For spoiler spans, account for the || markers that are visually hidden
      if (node.nodeName === 'SPAN' && (node as HTMLElement).dataset.spoiler !== undefined) {
        remaining -= 2; // opening ||
        for (const child of Array.from(node.childNodes)) {
          const result = findOffset(child);
          if (result) return result;
        }
        remaining -= 2; // closing ||
        return null;
      }
      if (node.nodeName === 'SPAN' && (node as HTMLElement).dataset.mentionId) {
        const e = node as HTMLElement;
        const tokenLen = `@[${e.dataset.mentionName}:${e.dataset.mentionId}]`.length;
        if (remaining <= tokenLen) return { node: node.parentNode!, offset: Array.from(node.parentNode!.childNodes).indexOf(node as ChildNode) + 1 };
        remaining -= tokenLen;
        return null;
      }
      for (const child of Array.from(node.childNodes)) {
        const result = findOffset(child);
        if (result) return result;
      }
      return null;
    }
    const pos = findOffset(el);
    if (pos) {
      const newRange = document.createRange();
      newRange.setStart(pos.node, pos.offset);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }
}

// Clean up phantom <div> wrappers that Chrome creates when deleting
// contentEditable=false elements (e.g. mention spans).  Only removes
// truly empty divs (zero-width spaces, whitespace-only) — non-empty
// divs represent real newlines and must be preserved.
function cleanupPhantomDivs(el: HTMLElement): void {
  for (const div of Array.from(el.querySelectorAll(':scope > div'))) {
    const text = div.textContent ?? '';
    if (text.replace(/[\u200B\u00A0\s]/g, '') === '') {
      div.remove();
    }
    // Non-empty divs are intentional line breaks — leave them alone.
  }
}

function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// Timestamp of the last scrollFormIntoView call — used to prevent the onFocus
// handler from firing a duplicate scroll when focus(true) already triggered one.
let lastScrollCallTs = 0;

// Scroll the reply form into the centre of the visible viewport.
// On mobile we listen for visualViewport 'resize' events (fired when the
// keyboard actually opens) instead of guessing with a fixed timeout.
// Uses instant jump (no smooth animation) to avoid fighting the keyboard.
function scrollFormIntoView(el: HTMLElement): void {
  lastScrollCallTs = Date.now();
  const scrollTarget = el.closest('form')?.parentElement || el;
  const mobile = isTouchDevice();

  if (!mobile || !window.visualViewport) {
    scrollTarget.scrollIntoView({ block: 'center' });
    return;
  }

  const vv = window.visualViewport;
  let rafId = 0;
  let lastHeight = vv.height;

  const reposition = () => {
    // Only reposition when the viewport height actually changed (keyboard
    // opening/closing), not on every scroll tick.  This avoids a feedback
    // loop where scrollBy triggers another visualViewport scroll event.
    const curHeight = vv.height;
    if (Math.abs(curHeight - lastHeight) < 1) return;
    lastHeight = curHeight;

    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const rect = scrollTarget.getBoundingClientRect();
      // On iOS Safari visualViewport reflects the visible area above the
      // keyboard.  pageTop is the absolute top of that visible rectangle in
      // page coordinates; we use it + vv.height to find the visible centre.
      const pageTop = vv.offsetTop + window.scrollY;
      const visibleCenter = pageTop + vv.height / 2;
      const elemPageCenter = rect.top + window.scrollY + rect.height / 2;
      const drift = elemPageCenter - visibleCenter;
      if (Math.abs(drift) > 10) {
        window.scrollBy({ top: drift, left: 0, behavior: 'instant' as ScrollBehavior });
      }
    });
  };

  // Do an initial reposition after a short delay to let the keyboard start
  // animating (the visualViewport height hasn't changed yet at focus time).
  setTimeout(() => {
    lastHeight = 0; // force the guard to pass on the first real check
    reposition();
  }, 120);

  // Track viewport resize as the keyboard animates open.
  // Only listen to 'resize' — NOT 'scroll'.  On iOS, calling scrollBy()
  // inside a visualViewport scroll handler creates a feedback loop that
  // causes the erratic jiggling reported on iPhone 12/13.
  vv.addEventListener('resize', reposition);
  setTimeout(() => {
    vv.removeEventListener('resize', reposition);
    cancelAnimationFrame(rafId);
  }, 1500);
}

const MentionInput = React.forwardRef<MentionInputHandle, MentionInputProps>((props, ref) => {
  const { placeholder, disabled, onContentChange, onSubmit, onImagePaste, className, size = 'md' } = props;

  const editorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const { users, loading, fetchUsers } = useMentionUsers();
  const { user: currentUser } = useAuth();
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isEmpty, setIsEmpty] = useState(true);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  // Use refs so the imperative handle never holds stale callback references
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const filteredUsers = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.toLowerCase();
    return users
      .filter(u => u.id !== currentUser?.id)
      .filter(u => q === '' || u.name.toLowerCase().startsWith(q))
      .slice(0, 5);
  }, [users, mentionQuery, currentUser?.id]);

  // Reset selection when the filtered list changes
  useEffect(() => { setSelectedIndex(0); }, [filteredUsers]);

  // Position the dropdown near the caret each time the query text changes
  useEffect(() => {
    if (!mentionQuery) return;
    const rect = getCaretRect();
    if (!rect) return;
    const DROPDOWN_HEIGHT = 240;
    const MARGIN = 4;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < DROPDOWN_HEIGHT + MARGIN;
    setDropdownStyle({
      position: 'fixed',
      left: `${Math.min(rect.left, window.innerWidth - 256)}px`,
      top: showAbove
        ? `${rect.top - DROPDOWN_HEIGHT - MARGIN}px`
        : `${rect.bottom + MARGIN}px`,
      zIndex: 200,
      width: '240px',
    });
  }, [mentionQuery?.query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown when clicking outside both the editor and the dropdown
  useEffect(() => {
    if (!mentionQuery) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current?.contains(e.target as Node) ||
        editorRef.current?.contains(e.target as Node)
      ) return;
      setMentionQuery(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [!!mentionQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    clear() {
      const el = editorRef.current;
      if (!el) return;
      el.innerHTML = '';
      setIsEmpty(true);
      setMentionQuery(null);
      onContentChangeRef.current('');
    },
    focus(scrollIntoView?: boolean) {
      const el = editorRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (scrollIntoView) {
        scrollFormIntoView(el);
      }
    },
    insertText(text: string) {
      const el = editorRef.current;
      if (!el) return;
      insertAtCursor(el, text, savedRangeRef.current);
    },
    insertMention(user: { id: string; name: string }) {
      const el = editorRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      cleanupPhantomDivs(el);
      const sel = window.getSelection()!;
      // Move cursor to end of content
      const endRange = document.createRange();
      endRange.selectNodeContents(el);
      endRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(endRange);

      const span = document.createElement('span');
      span.contentEditable = 'false';
      span.dataset.mentionId = user.id;
      span.dataset.mentionName = user.name;
      span.textContent = `@${user.name}`;
      span.className = 'text-blue-400 font-medium';

      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(span);

      const spaceNode = document.createTextNode('\u00A0');
      span.after(spaceNode);

      const newRange = document.createRange();
      newRange.setStart(spaceNode, 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      const serialized = serializeContent(el);
      setIsEmpty(serialized === '');
      onContentChangeRef.current(serialized);
      setMentionQuery(null);
    },
    wrapSpoiler() {
      const el = editorRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const sel = window.getSelection();
      if (!sel) return;

      // Restore saved range if the editor lost focus (e.g. clicking toolbar button)
      if (savedRangeRef.current && el.contains(savedRangeRef.current.startContainer)) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current.cloneRange());
      }

      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      if (!range.collapsed && el.contains(range.commonAncestorContainer)) {
        // Has selection — wrap it with ||
        const selectedText = range.toString();
        range.deleteContents();
        const textNode = document.createTextNode(`||${selectedText}||`);
        range.insertNode(textNode);
        // Place cursor after the closing ||
        const newRange = document.createRange();
        newRange.setStart(textNode, textNode.length);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } else {
        // No selection — insert |||| and place cursor in the middle
        const textNode = document.createTextNode('||||');
        range.deleteContents();
        range.insertNode(textNode);
        const newRange = document.createRange();
        newRange.setStart(textNode, 2); // between the two ||
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }

      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  function doInsertMention(query: MentionQuery, user: MentionUser) {
    const { atNode, atNodeOffset, query: q } = query;
    if (editorRef.current) cleanupPhantomDivs(editorRef.current);

    // Delete the "@query" text and replace with a styled, non-editable span
    const range = document.createRange();
    range.setStart(atNode, atNodeOffset);
    range.setEnd(atNode, atNodeOffset + 1 + q.length);
    range.deleteContents();

    const span = document.createElement('span');
    span.contentEditable = 'false';
    span.dataset.mentionId = user.id;
    span.dataset.mentionName = user.name;
    span.textContent = `@${user.name}`;
    span.className = 'text-blue-400 font-medium';
    range.insertNode(span);

    // Insert a non-breaking space after the span so the cursor has somewhere to go.
    // serializeContent() converts \u00A0 → regular space so the server sees a normal space.
    const spaceNode = document.createTextNode('\u00A0');
    span.after(spaceNode);

    // Place cursor right after the inserted space
    const sel = window.getSelection()!;
    const newRange = document.createRange();
    newRange.setStart(spaceNode, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    if (editorRef.current) {
      const serialized = serializeContent(editorRef.current);
      setIsEmpty(serialized === '');
      onContentChangeRef.current(serialized);
    }
    setMentionQuery(null);
  }

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;

    // Remove spoiler spans that have been emptied by the user
    const spoilerSpans = el.querySelectorAll('span[data-spoiler]');
    for (const span of Array.from(spoilerSpans)) {
      if (!span.textContent) {
        span.parentNode?.removeChild(span);
      }
    }

    // After Ctrl+A → Delete, Chrome may leave a lone <br> which serializes as
    // a phantom "\n". If the editor has no real text content, wipe it clean.
    if (!el.textContent?.replace(/[\u200B\u00A0\s]/g, '') && el.querySelector('br') && !el.querySelector('span[data-mention-id], span[data-spoiler]')) {
      el.innerHTML = '';
    }

    const serialized = serializeContent(el);
    setIsEmpty(serialized === '');
    onContentChangeRef.current(serialized);

    const query = detectMentionQuery();
    if (query) {
      // Lazy-load the user list the first time @ is triggered
      if (users.length === 0 && !loading) fetchUsers();
      setMentionQuery(query);
    } else {
      setMentionQuery(null);
    }

    // Decorate new ||text|| patterns in plain text nodes (skips existing spoiler spans)
    decorateSpoilers(el);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Submit shortcut
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmitRef.current();
      return;
    }

    // Enter inside a spoiler span → escape out of it
    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.getRangeAt(0).startContainer;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset.spoiler !== undefined) {
            e.preventDefault();
            const spoilerSpan = node as HTMLElement;
            // Insert a zero-width space after the spoiler span and place cursor there (same line)
            const textNode = document.createTextNode('\u00A0');
            spoilerSpan.after(textNode);
            const newRange = document.createRange();
            newRange.setStart(textNode, 1);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            editorRef.current?.dispatchEvent(new InputEvent('input', { bubbles: true }));
            return;
          }
          node = node.parentNode;
        }
      }
    }

    // Dropdown navigation
    if (mentionQuery && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredUsers.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        doInsertMention(mentionQuery, filteredUsers[selectedIndex]);
        return;
      }
    }

    if (e.key === 'Escape' && mentionQuery) {
      e.preventDefault();
      setMentionQuery(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const items = e.clipboardData.items;

    // Check for image files first
    if (onImagePaste) {
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { onImagePaste(file); return; }
        }
      }
    }

    // Insert plain text at caret, stripping any HTML from the clipboard
    const text = e.clipboardData.getData('text/plain');
    if (text && editorRef.current) {
      insertAtCursor(editorRef.current, text);
    }
  };

  const textSizeClass = size === 'sm' ? 'text-sm' : '';

  return (
    <div className="relative w-full overflow-hidden">
      {/* Simulated placeholder — contenteditable has no native placeholder support */}
      {isEmpty && (
        <div
          className={`absolute top-0 left-0 text-th-text-4 pointer-events-none select-none ${textSizeClass}`}
          aria-hidden="true"
        >
          {placeholder}
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={() => {
          // When the user taps the input directly (not via the Reply button),
          // we still need to scroll the form into view.  Skip if focus(true)
          // already triggered scrollFormIntoView within the last 500ms.
          if (isTouchDevice() && editorRef.current && Date.now() - lastScrollCallTs > 500) {
            scrollFormIntoView(editorRef.current);
          }
        }}
        onBlur={() => {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            savedRangeRef.current = sel.getRangeAt(0).cloneRange();
          }
        }}
        role="textbox"
        aria-multiline="true"
        className={`w-full outline-none text-th-text bg-transparent break-words whitespace-pre-wrap min-h-[1.5rem] ${textSizeClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className ?? ''}`}
      />

      {/* Mention dropdown */}
      {mentionQuery && (filteredUsers.length > 0 || loading) && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-th-card border border-th-border rounded-lg shadow-xl overflow-hidden"
        >
          {loading && users.length === 0 && (
            <div className="px-3 py-2 text-sm text-th-text-4">Загрузка...</div>
          )}
          {filteredUsers.map((user, i) => (
            <button
              key={user.id}
              type="button"
              // onMouseDown fires before onBlur, preserving the editor selection
              // needed for doInsertMention to read the caret position
              onMouseDown={(e) => {
                e.preventDefault();
                doInsertMention(mentionQuery, user);
              }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors ${
                i === selectedIndex ? 'bg-th-elevated' : 'hover:bg-th-elevated'
              }`}
            >
              <img
                src={user.avatar}
                alt={user.name}
                className="w-6 h-6 rounded-full object-cover shrink-0 bg-th-input"
              />
              <span className="text-th-text-2 text-sm font-medium truncate">{user.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

MentionInput.displayName = 'MentionInput';
export default MentionInput;
