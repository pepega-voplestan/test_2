import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import MentionInput from '../../components/MentionInput';
import { AuthProvider } from '../../context/AuthContext';

// AuthProvider fetches /api/v1/me on mount; stub it so tests don't hit the
// network or log a spurious "Session refresh failed" error (see tests/helpers.tsx).
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ user: null }),
  }));
});

function renderEditor() {
  const onContentChange = vi.fn();
  const { container } = render(
    <AuthProvider><MentionInput placeholder="" onContentChange={onContentChange} onSubmit={() => {}} /></AuthProvider>
  );
  const editor = container.querySelector('[contenteditable]') as HTMLElement;
  return { editor, onContentChange };
}

function lastSerialized(onContentChange: ReturnType<typeof vi.fn>): string {
  const calls = onContentChange.mock.calls;
  return calls[calls.length - 1][0];
}

describe('MentionInput — newline serialization (mobile Enter double-newline bug)', () => {
  it('a leftover placeholder <br> alongside real text in the same line does not double the newline', () => {
    const { editor, onContentChange } = renderEditor();
    // Some mobile keyboards (Android Chrome/Gboard) leave the empty-line
    // placeholder <br> a new <div> gets on Enter in place even once real
    // text is typed into that same block.
    editor.innerHTML = '<div>Line1</div><div><br>Line2</div>';
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(lastSerialized(onContentChange)).toBe('Line1\nLine2');
  });

  it('the clean two-<div> shape (no stray <br>) still serializes with a single newline', () => {
    const { editor, onContentChange } = renderEditor();
    editor.innerHTML = '<div>Line1</div><div>Line2</div>';
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(lastSerialized(onContentChange)).toBe('Line1\nLine2');
  });

  it('an intentional blank line between two lines (two Enters) still serializes as exactly two newlines', () => {
    const { editor, onContentChange } = renderEditor();
    editor.innerHTML = '<div>Line1</div><div><br></div><div>Line3</div>';
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(lastSerialized(onContentChange)).toBe('Line1\n\nLine3');
  });

  it('a leading blank line (Enter pressed before any text) is preserved, not stripped', () => {
    const { editor, onContentChange } = renderEditor();
    editor.innerHTML = '<div><br>Hello</div>';
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(lastSerialized(onContentChange)).toBe('\nHello');
  });

  it('a genuine Shift+Enter soft break mid-line is unaffected', () => {
    const { editor, onContentChange } = renderEditor();
    editor.innerHTML = '<div>Line1a<br>Line1b</div>';
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(lastSerialized(onContentChange)).toBe('Line1a\nLine1b');
  });
});
