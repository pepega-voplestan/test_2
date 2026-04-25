import React, { useState, useRef, useEffect, useMemo, useImperativeHandle } from 'react';
import { MentionUser } from '../types';
import { useMentionUsers } from '../hooks/useMentionUsers';
import { useAuth } from '../context/AuthContext';

export interface MentionInputHandle {
  clear(): void;
  focus(scrollIntoView?: boolean): void;
  scrollIntoView(): void;
  insertText(text: string): void;
  insertMention(user: { id: string; name: string }): void;
  wrapSpoiler(): void;
  populate(serialized: string): void;
}

export interface MentionInputProps {
  placeholder: string;
  disabled?: boolean;
  onContentChange: (serialized: string) => void;
  onSubmit: () => void;
  onImagePaste?: (file: File) => void;
  className?: string;
  size?: 'sm' | 'md';
  initialValue?: string;
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

// Check whether a node lives inside a contentEditable=false mention span.
// Used by getCharOffset / setCaretAtOffset to treat mentions as atomic blocks
// so the cursor is never placed inside a non-editable element.
function isInsideMentionSpan(node: Node, root: HTMLElement): boolean {
  let parent = node.parentElement;
  while (parent && parent !== root) {
    if (parent.dataset.mentionId) return true;
    parent = parent.parentElement;
  }
  return false;
}

// Compute the character offset of a collapsed Range within a contenteditable.
// Counts text characters + 1 per <br>/<div> line break so the offset survives
// DOM restructuring (e.g. Chrome wrapping lines in <div>s on re-focus).
// Mention spans are counted as atomic blocks (by their textContent length)
// so the cursor is never mapped into a contentEditable=false subtree.
function getCharOffset(root: HTMLElement, range: Range): number {
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    // Skip nodes inside non-editable mention spans — the mention element
    // itself is counted as an atomic block below.
    if (isInsideMentionSpan(node, root)) continue;
    if (node === range.startContainer) {
      return offset + (node.nodeType === Node.TEXT_NODE ? range.startOffset : 0);
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node as Text).length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName;
      if (tag === 'BR') offset += 1;
      else if (tag === 'DIV' && node !== root && node.previousSibling) offset += 1;
      else if (tag === 'SPAN' && el.dataset.mentionId) {
        offset += (el.textContent ?? '').length;
      }
    }
  }
  return offset; // fallback: end
}

// Restore a selection at a given character offset.
// Mention spans are treated as atomic blocks — the cursor is placed before or
// after them, never inside, since they are contentEditable=false.
// Find the DOM node and offset corresponding to a character offset in the editor.
// Returns { node, offset } suitable for Range.setStart/setEnd, or null (fallback to end).
function findDOMPosition(root: HTMLElement, targetOffset: number): { node: Node; offset: number; before?: boolean } | null {
  let remaining = targetOffset;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (isInsideMentionSpan(node, root)) continue;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node as Text).length;
      if (remaining <= len) {
        return { node, offset: remaining };
      }
      remaining -= len;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName;
      if (tag === 'SPAN' && el.dataset.mentionId) {
        const mentionLen = (el.textContent ?? '').length;
        if (remaining <= 0) return { node, offset: 0, before: true };
        if (remaining <= mentionLen) return { node, offset: 0, before: false }; // snap to after
        remaining -= mentionLen;
      } else if (tag === 'BR' || (tag === 'DIV' && node !== root && node.previousSibling)) {
        if (remaining <= 0) return { node, offset: 0, before: true };
        remaining -= 1;
      }
    }
  }
  return null;
}

function setCaretAtOffset(root: HTMLElement, targetOffset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const pos = findDOMPosition(root, targetOffset);
  const r = document.createRange();
  if (pos) {
    if (pos.before === true) r.setStartBefore(pos.node);
    else if (pos.before === false) r.setStartAfter(pos.node);
    else r.setStart(pos.node, pos.offset);
  } else {
    r.selectNodeContents(root);
  }
  r.collapse(pos ? true : false);
  sel.removeAllRanges();
  sel.addRange(r);
}

// Restore a full selection range between two character offsets.
function setSelectionAtOffsets(root: HTMLElement, startOffset: number, endOffset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const startPos = findDOMPosition(root, startOffset);
  const endPos = findDOMPosition(root, endOffset);
  const r = document.createRange();
  if (startPos) {
    if (startPos.before === true) r.setStartBefore(startPos.node);
    else if (startPos.before === false) r.setStartAfter(startPos.node);
    else r.setStart(startPos.node, startPos.offset);
  } else {
    r.selectNodeContents(root);
    r.collapse(true);
  }
  if (endPos) {
    if (endPos.before === true) r.setEndBefore(endPos.node);
    else if (endPos.before === false) r.setEndAfter(endPos.node);
    else r.setEnd(endPos.node, endPos.offset);
  } else {
    r.selectNodeContents(root);
    r.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(r);
}

// Inserts plain text at the current caret position inside a contenteditable element.
// Handles multi-line text (splits on \n → <br>). Dispatches a synthetic 'input' event
// so the React onInput handler picks up the change for serialization.
// `savedOffset` is a character-based cursor position used to restore the caret when
// the editor had lost focus (e.g. after clicking the emoji picker).  Character offsets
// survive DOM restructuring that invalidates Range node references.
function insertAtCursor(el: HTMLElement, text: string, savedOffset?: number | null): void {
  el.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (!sel) return;

  if (savedOffset != null) {
    setCaretAtOffset(el, savedOffset);
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
// <span data-spoiler>content</span>. Preserves the caret position by tracking it
// relative to the specific text node being mutated (avoids global offset counting
// which breaks with mentions, BRs, and block elements).
function decorateSpoilers(el: HTMLElement): void {
  const sel = window.getSelection();
  const cursorContainer = (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer))
    ? sel.getRangeAt(0).startContainer
    : null;
  const cursorOffset = cursorContainer ? sel!.getRangeAt(0).startOffset : -1;

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
  let cursorTarget: { node: Node; offset: number } | null = null;

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    SPOILER_RE.lastIndex = 0;
    if (!SPOILER_RE.test(text)) continue;

    const isCursorInThisNode = cursorContainer === textNode;

    // Build replacement fragment, mapping cursor position if it falls in this node
    SPOILER_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SPOILER_RE.exec(text)) !== null) {
      // Text before the match
      if (match.index > lastIndex) {
        const beforeNode = document.createTextNode(text.slice(lastIndex, match.index));
        frag.appendChild(beforeNode);
        if (isCursorInThisNode && cursorOffset >= lastIndex && cursorOffset <= match.index) {
          cursorTarget = { node: beforeNode, offset: cursorOffset - lastIndex };
        }
      }
      // Spoiler span
      const span = document.createElement('span');
      span.dataset.spoiler = '';
      span.className = 'bg-th-text-4/30 rounded px-0.5';
      span.textContent = match[1]; // inner text without ||
      frag.appendChild(span);

      // Map cursor if it falls inside this ||...|| match
      const innerStart = match.index + 2;
      const innerEnd = innerStart + match[1].length;
      const matchEnd = match.index + match[0].length;
      if (isCursorInThisNode && !cursorTarget && cursorOffset >= match.index && cursorOffset <= matchEnd) {
        if (cursorOffset <= innerStart) {
          // In or before opening || → snap to start of inner text
          cursorTarget = { node: span.firstChild!, offset: 0 };
        } else if (cursorOffset <= innerEnd) {
          // Inside inner text
          cursorTarget = { node: span.firstChild!, offset: cursorOffset - innerStart };
        } else {
          // In or after closing || → snap to end of inner text
          cursorTarget = { node: span.firstChild!, offset: match[1].length };
        }
      }

      lastIndex = matchEnd;
    }
    // Remaining text after last match
    if (lastIndex < text.length) {
      const afterNode = document.createTextNode(text.slice(lastIndex));
      frag.appendChild(afterNode);
      if (isCursorInThisNode && cursorOffset >= lastIndex) {
        cursorTarget = { node: afterNode, offset: cursorOffset - lastIndex };
      }
    } else if (isCursorInThisNode && cursorOffset >= lastIndex && !cursorTarget) {
      // Cursor is at the very end, right after the last match's closing ||.
      // Create an empty text node so the cursor has somewhere to land.
      const tailNode = document.createTextNode('');
      frag.appendChild(tailNode);
      cursorTarget = { node: tailNode, offset: 0 };
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }

  if (!cursorTarget) return;

  // Restore caret inside the replaced fragment
  if (sel) {
    const r = document.createRange();
    r.setStart(cursorTarget.node, cursorTarget.offset);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
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
      // A <div><br></div> is an intentional empty line (user pressed Enter).
      // Only remove truly empty phantom wrappers that Chrome creates when
      // deleting contentEditable=false elements (e.g. mention spans).
      if (div.querySelector('br')) continue;
      div.remove();
    }
  }
}

function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Centre the element in the visible viewport (accounting for the on-screen
// keyboard on mobile).  On touch devices we listen for the visualViewport
// resize that fires when the keyboard finishes animating, then do a single
// scroll correction.  An 800ms timeout acts as a fallback for devices that
// don't fire a resize (e.g. keyboard was already open).
function scrollFormIntoView(el: HTMLElement, expectKeyboard = false): void {
  if (!isTouchDevice() || !window.visualViewport) {
    // Desktop: immediate centre, no keyboard to worry about.
    el.scrollIntoView({ block: 'center' });
    return;
  }

  const vv = window.visualViewport;

  const centreNow = () => {
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const elemPageCenter = rect.top + window.scrollY + rect.height / 2;
      const targetScrollY = elemPageCenter - vv.offsetTop - vv.height / 2;
      if (Math.abs(window.scrollY - targetScrollY) > 10) {
        window.scrollTo({ top: targetScrollY, left: 0, behavior: 'instant' as ScrollBehavior });
      }
    });
  };

  if (!expectKeyboard) {
    // No keyboard expected (iOS reply paths, or keyboard already open).
    // Scroll immediately — no need to wait for a viewport resize.
    centreNow();
    return;
  }

  // Keyboard is expected to open (Android focus paths).  Wait for the
  // visualViewport resize that fires when the keyboard finishes animating,
  // then do a single scroll correction.
  let done = false;

  const centre = () => {
    if (done) return;
    done = true;
    vv.removeEventListener('resize', onResize);
    centreNow();
  };

  // Debounce: wait 300ms after the last resize event so the keyboard
  // animation and any native focus-scroll are fully settled.
  let debounceTimer: ReturnType<typeof setTimeout>;
  const onResize = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(centre, 300);
  };

  vv.addEventListener('resize', onResize);
  // Fallback: if no resize fires (keyboard already open), scroll after 800ms
  setTimeout(() => {
    clearTimeout(debounceTimer);
    centre();
  }, 800);
}

// Parse a serialized string (mentions + spoilers) and populate the contenteditable el.
function populateFromSerialized(el: HTMLElement, serialized: string): void {
  el.innerHTML = '';
  if (!serialized) return;

  const TOKEN_RE = /(@\[([^\]]+):([^\]]+)\]|\|\|(.+?)\|\|)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const appendText = (text: string) => {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) el.appendChild(document.createElement('br'));
      if (line) el.appendChild(document.createTextNode(line));
    });
  };

  let lastWasMention = false;
  while ((match = TOKEN_RE.exec(serialized)) !== null) {
    if (match.index > lastIndex) {
      appendText(serialized.slice(lastIndex, match.index));
      lastWasMention = false;
    }
    if (match[1].startsWith('@[')) {
      const span = document.createElement('span');
      span.contentEditable = 'false';
      span.dataset.mentionId = match[3];
      span.dataset.mentionName = match[2];
      span.textContent = `@${match[2]}`;
      span.className = 'text-blue-400 font-medium';
      el.appendChild(span);
      lastWasMention = true;
    } else {
      const span = document.createElement('span');
      span.dataset.spoiler = '';
      span.className = 'bg-th-text-4/30 rounded px-0.5';
      span.textContent = match[4] ?? '';
      el.appendChild(span);
      lastWasMention = false;
    }
    lastIndex = TOKEN_RE.lastIndex;
  }

  if (lastIndex < serialized.length) appendText(serialized.slice(lastIndex));
  else if (lastWasMention) el.appendChild(document.createTextNode('​'));
}

const MentionInput = React.forwardRef<MentionInputHandle, MentionInputProps>((props, ref) => {
  const { placeholder, disabled, onContentChange, onSubmit, onImagePaste, className, size = 'md', initialValue } = props;

  const editorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const savedOffsetRef = useRef<{ start: number; end: number } | null>(null);
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
    const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
    const spaceBelow = visibleHeight - rect.bottom;
    const showAbove = spaceBelow < DROPDOWN_HEIGHT + MARGIN;
    const topPos = showAbove
      ? Math.max(MARGIN, rect.top - DROPDOWN_HEIGHT - MARGIN)
      : rect.bottom + MARGIN;
    setDropdownStyle({
      position: 'fixed',
      left: `${Math.min(rect.left, window.innerWidth - 256)}px`,
      top: `${topPos}px`,
      maxHeight: showAbove ? `${Math.max(80, rect.top - MARGIN * 2)}px` : `${Math.max(80, visibleHeight - rect.bottom - MARGIN * 2)}px`,
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
      if (isIOS()) {
        // iOS: never programmatically focus — the keyboard won't reliably
        // open from JS and causes scroll fights.  Just scroll into view;
        // the user taps the input themselves.
        if (scrollIntoView) scrollFormIntoView(el);
      } else {
        // Android & Desktop: let the browser do its native scroll-to-focus,
        // then scrollFormIntoView fires a single correction after the
        // keyboard animation settles via the visualViewport resize listener.
        el.focus();
        if (scrollIntoView) scrollFormIntoView(el, true);
      }
    },
    scrollIntoView() {
      const el = editorRef.current;
      if (!el) return;
      scrollFormIntoView(el);
    },
    insertText(text: string) {
      const el = editorRef.current;
      if (!el) return;
      insertAtCursor(el, text, savedOffsetRef.current?.start ?? null);
    },
    insertMention(user: { id: string; name: string }) {
      const el = editorRef.current;
      if (!el) return;

      if (isIOS()) {
        // iOS: avoid any focus() call — even with inputMode="none" iOS
        // Safari can still open the keyboard.  Instead, manipulate the
        // DOM directly (no Selection API needed) and blur afterwards.
        cleanupPhantomDivs(el);

        const span = document.createElement('span');
        span.contentEditable = 'false';
        span.dataset.mentionId = user.id;
        span.dataset.mentionName = user.name;
        span.textContent = `@${user.name}`;
        span.className = 'text-blue-400 font-medium';

        const spaceNode = document.createTextNode('\u00A0');
        el.appendChild(span);
        el.appendChild(spaceNode);

        // Save caret offset so that when the user taps to focus later,
        // the cursor lands after the mention.
        const caretOffset = getCharOffset(el, (() => {
          const r = document.createRange();
          r.setStart(spaceNode, 1);
          r.collapse(true);
          return r;
        })());
        savedOffsetRef.current = { start: caretOffset, end: caretOffset };

        // Ensure the element is not focused (keyboard stays closed).
        el.blur();

        const serialized = serializeContent(el);
        setIsEmpty(serialized === '');
        onContentChangeRef.current(serialized);
        setMentionQuery(null);
        return;
      }

      // Android & Desktop: focus is needed for the Selection API.
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

      // Restore cursor/selection if the editor lost focus (e.g. clicking toolbar button).
      // Uses character-offset-based restoration (same approach as insertAtCursor) so that
      // DOM restructuring (e.g. Chrome wrapping lines in <div>s) doesn't invalidate the position.
      // Restores the full selection range (not just collapsed caret) so that wrapSpoiler
      // can detect selected text and wrap it with ||...|| markers.
      if (savedOffsetRef.current != null) {
        const { start, end } = savedOffsetRef.current;
        if (start !== end) {
          setSelectionAtOffsets(el, start, end);
        } else {
          setCaretAtOffset(el, start);
        }
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

      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      if (!range.collapsed && el.contains(range.commonAncestorContainer)) {
        // Has selection — extract as fragment to preserve line breaks and
        // structure, then serialize to text keeping newlines.
        const frag = range.extractContents();
        const tmp = document.createElement('div');
        tmp.appendChild(frag);
        // Convert <br> and block-level elements to newlines
        for (const br of Array.from(tmp.querySelectorAll('br'))) {
          br.replaceWith('\n');
        }
        for (const div of Array.from(tmp.querySelectorAll('div'))) {
          if (div.previousSibling) div.before('\n');
          div.replaceWith(...Array.from(div.childNodes));
        }
        const selectedText = tmp.textContent ?? '';
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
        range.insertNode(textNode);
        const newRange = document.createRange();
        newRange.setStart(textNode, 2); // between the two ||
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }

      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    },
    populate(serialized: string) {
      const el = editorRef.current;
      if (!el) return;
      populateFromSerialized(el, serialized);
      setIsEmpty(serialized === '');
      onContentChangeRef.current(serialized);
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // iOS Safari places the cursor at the end of the content after deleting a
  // contentEditable=false mention span. Intercept the deletion ourselves so we
  // can remove the span and place the caret at the correct position.
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !isIOS()) return;

    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType !== 'deleteContentBackward') return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return;

      const { startContainer, startOffset } = range;
      let mentionSpan: HTMLElement | null = null;

      if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
        const prev = startContainer.previousSibling;
        if (prev?.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).dataset.mentionId) {
          mentionSpan = prev as HTMLElement;
        }
      } else if (startContainer.nodeType === Node.ELEMENT_NODE && startOffset > 0) {
        const prev = (startContainer as Element).childNodes[startOffset - 1];
        if (prev?.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).dataset.mentionId) {
          mentionSpan = prev as HTMLElement;
        }
      }

      if (!mentionSpan) return;

      e.preventDefault();
      const charOffset = getCharOffset(el, range);
      const mentionLen = (mentionSpan.textContent ?? '').length;
      mentionSpan.remove();
      setCaretAtOffset(el, charOffset - mentionLen);
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    };

    el.addEventListener('beforeinput', onBeforeInput as EventListener);
    return () => el.removeEventListener('beforeinput', onBeforeInput as EventListener);
  }, []);

  // Populate from initialValue on mount (used by edit mode)
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !initialValue) return;
    populateFromSerialized(el, initialValue);
    setIsEmpty(initialValue === '');
    onContentChangeRef.current(initialValue);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // iOS Safari auto-zooms any editable element with font-size < 16px.
  // Skip text-sm on iOS to prevent unwanted zoom on focus.
  const textSizeClass = size === 'sm' && !isIOS() ? 'text-sm' : '';

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
          // Intentionally empty — let the browser handle native scroll-to-focus
          // on direct tap.  Imperative focus(true) calls scrollFormIntoView
          // explicitly when needed (Reply button paths).
        }}
        onBlur={() => {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0 && editorRef.current) {
            const range = sel.getRangeAt(0);
            const start = getCharOffset(editorRef.current, range);
            // Also save end offset so selection can be restored (e.g. for wrapSpoiler)
            const endRange = document.createRange();
            endRange.setStart(range.endContainer, range.endOffset);
            endRange.collapse(true);
            const end = getCharOffset(editorRef.current, endRange);
            savedOffsetRef.current = { start, end };
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
