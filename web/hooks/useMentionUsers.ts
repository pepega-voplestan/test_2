import { useState } from 'react';
import { MentionUser } from '../types';

// Module-level singleton — survives component unmounts and remounts.
// The user list is stable enough that we cache it for the entire browser session.
let cachedUsers: MentionUser[] | null = null;
let fetchPromise: Promise<MentionUser[]> | null = null;

async function fetchMentionUsers(): Promise<MentionUser[]> {
  if (cachedUsers !== null) return cachedUsers;

  // Deduplicate concurrent calls — if a fetch is already in-flight, return the same promise
  if (fetchPromise !== null) return fetchPromise;

  fetchPromise = fetch('/api/v1/users/mentions', { credentials: 'include' })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data: { users: MentionUser[] }) => {
      cachedUsers = data.users;
      fetchPromise = null;
      return cachedUsers;
    })
    .catch(err => {
      fetchPromise = null; // allow retry on next @
      throw err;
    });

  return fetchPromise;
}

export function useMentionUsers(): {
  users: MentionUser[];
  loading: boolean;
  error: string | null;
  fetchUsers: () => void;
} {
  const [users, setUsers] = useState<MentionUser[]>(cachedUsers ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Imperative — only called when user types @, achieving true lazy loading
  const fetchUsers = () => {
    if (cachedUsers !== null) {
      setUsers(cachedUsers);
      return;
    }
    setLoading(true);
    setError(null);
    fetchMentionUsers()
      .then(result => {
        setUsers(result);
        setLoading(false);
      })
      .catch(err => {
        setError('Не удалось загрузить пользователей');
        setLoading(false);
        console.error('[useMentionUsers] Fetch error:', err);
      });
  };

  return { users, loading, error, fetchUsers };
}
