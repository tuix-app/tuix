export function linkedIssue(search = location.search): string | null {
  const value = new URLSearchParams(search).get('tuix');
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
