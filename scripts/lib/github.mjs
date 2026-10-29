// Minimal GitHub REST client built on fetch, so the scripts need no dependencies.
const API = 'https://api.github.com';

export function createClient(token = process.env.GITHUB_TOKEN) {
  if (!token) throw new Error('GITHUB_TOKEN is required');

  async function request(method, path, body) {
    const res = await fetch(path.startsWith('http') ? path : API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dgalbums',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = new Error(`${method} ${path} failed with ${res.status}: ${await res.text()}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async function paginate(path) {
    const all = [];
    const sep = path.includes('?') ? '&' : '?';
    for (let page = 1; ; page++) {
      const items = await request('GET', `${path}${sep}per_page=100&page=${page}`);
      all.push(...items);
      if (items.length < 100) return all;
    }
  }

  return {
    request,
    paginate,
    get: path => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
  };
}

export function requireRepo() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY (owner/name) is required');
  return repo;
}
