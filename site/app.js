// dG Albums: renders data.json (built from GitHub Issues by scripts/build-data.mjs).
// Plain JavaScript with hash routing: #/, #/projects, #/projects/12, #/clients, #/clients/7,
// #/people, #/people/login.

const STATUS = {
  'on-track': { label: 'On track', order: 3 },
  'at-risk': { label: 'At risk', order: 1 },
  'off-track': { label: 'Off track', order: 0 },
  pending: { label: 'No update yet', order: 2 },
  paused: { label: 'Paused', order: 4 },
  done: { label: 'Done', order: 5 },
  archived: { label: 'Archived', order: 6 },
};

const REACTION_EMOJI = {
  '+1': '👍',
  '-1': '👎',
  laugh: '😄',
  hooray: '🎉',
  confused: '😕',
  heart: '❤️',
  rocket: '🚀',
  eyes: '👀',
};

const ME_KEY = 'dgalbums.me';
const LOCALE = 'en-ZA';
const DAY = 24 * 60 * 60 * 1000;

const app = document.getElementById('app');
let data = null;
let me = readMe();
let feedScope = 'following';
const filters = { query: '', status: '', client: '', tag: '', followingOnly: false, showClosed: false };

// ---------- helpers ----------

function readMe() {
  try {
    return localStorage.getItem(ME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveMe(login) {
  me = login;
  try {
    localStorage.setItem(ME_KEY, login);
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function md(text) {
  if (!window.marked || !window.DOMPurify) return `<p style="white-space:pre-wrap">${esc(text)}</p>`;
  return DOMPurify.sanitize(marked.parse(text ?? '', { gfm: true, breaks: true }));
}

const sameLogin = (a, b) => Boolean(a && b) && a.toLowerCase() === b.toLowerCase();
const isFollower = (project, login) => project.followers.some(f => sameLogin(f, login));
const isActive = project => project.state === 'open';
const personOf = login => data.peopleByLogin.get(login.toLowerCase());

const formatDate = iso => new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const formatDateTime = iso => new Date(iso).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
// Target dates are plain YYYY-MM-DD values with no time zone.
const formatDay = ymd =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const isPast = ymd => ymd < new Date().toISOString().slice(0, 10);

const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
function relativeTime(iso) {
  const diff = Date.parse(iso) - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60 * 60 * 1000) return rtf.format(Math.round(diff / 60000), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / 3600000), 'hour');
  if (abs < 7 * DAY) return rtf.format(Math.round(diff / DAY), 'day');
  return formatDate(iso);
}

function weekStart(iso) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d;
}

function links() {
  const base = `https://github.com/${data.repo}`;
  return {
    repo: base,
    newProject: `${base}/issues/new?template=project.yml`,
    newClient: `${base}/issues/new?template=client.yml`,
    newClientProject: client => `${base}/issues/new?${new URLSearchParams({ template: 'project.yml', client: client.title })}`,
    postUpdate: project =>
      `${base}/issues/new?${new URLSearchParams({
        template: 'status-update.yml',
        title: `Update: ${project.title}`,
        project: String(project.number),
      })}`,
  };
}

// ---------- small pieces of HTML ----------

const pill = status => `<span class="pill pill-${esc(status)}">${esc((STATUS[status] ?? STATUS.pending).label)}</span>`;

function avatar(login, size = 24) {
  const src = personOf(login)?.avatar ?? `https://github.com/${login}.png?size=${size * 2}`;
  return `<img class="avatar" src="${esc(src)}" width="${size}" height="${size}" alt="" loading="lazy">`;
}

const personLink = (login, size = 24) =>
  `<a href="#/people/${encodeURIComponent(login)}" class="person">${avatar(login, size)}<span>${esc(personOf(login)?.name ?? login)}</span></a>`;

function avatarStack(logins, max = 6) {
  const shown = logins
    .slice(0, max)
    .map(l => `<a href="#/people/${encodeURIComponent(l)}" title="${esc(l)}">${avatar(l)}</a>`)
    .join('');
  const more = logins.length > max ? `<span class="avatar-more">+${logins.length - max}</span>` : '';
  return `<span class="avatar-stack">${shown}${more}</span>`;
}

// The project's client as a link, or the unmatched text from its Client field.
function clientOf(project) {
  const client = data.clientsByNumber.get(project.client);
  if (client) return `<a href="#/clients/${client.number}">${esc(client.title)}</a>`;
  return project.clientRef ? `<span class="muted" title="No client with this name">${esc(project.clientRef)}</span>` : '';
}

const timeAgo = iso => `<time datetime="${esc(iso)}" title="${esc(formatDateTime(iso))}">${esc(relativeTime(iso))}</time>`;
const external = (href, text, cls = '') =>
  `<a href="${esc(href)}" target="_blank" rel="noreferrer"${cls ? ` class="${cls}"` : ''}>${text}</a>`;
const empty = html => `<div class="empty">${html}</div>`;
const tags = list => (list.length ? `<div class="tags">${list.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : '');

function reactions(counts, url) {
  const chips = Object.entries(counts ?? {})
    .map(([key, n]) => external(url, `${REACTION_EMOJI[key] ?? esc(key)} ${n}`, 'reaction'))
    .join('');
  return `<div class="reactions">${chips}${external(url, '☺︎+', 'reaction reaction-add')}</div>`;
}

function comments(list, url, open = false) {
  const action = external(url, 'Comment on GitHub ↗');
  if (!list.length) return `<div class="comments"><div class="comments-bar"><span class="muted">No comments</span>${action}</div></div>`;
  const items = list
    .map(
      c => `<div class="comment">
        <div class="meta">${personLink(c.author, 20)}${external(c.url, timeAgo(c.createdAt), 'muted')}</div>
        <div class="markdown">${md(c.body)}</div>
        ${Object.keys(c.reactions).length ? reactions(c.reactions, c.url) : ''}
      </div>`,
    )
    .join('');
  return `<details class="comments"${open ? ' open' : ''}>
    <summary class="comments-bar"><span class="link-like">${list.length} comment${list.length > 1 ? 's' : ''}</span>${action}</summary>
    ${items}
  </details>`;
}

function updateCard(u, showProject = false) {
  const project = data.projectsByNumber.get(u.project);
  const statusChanged = u.previousStatus && u.previousStatus !== u.status;
  const dateChanged = u.targetDate && u.targetDate !== u.previousTargetDate;
  return `<article class="card update">
    <header class="update-head">
      ${
        showProject
          ? `<div><a href="#/projects/${project.number}" class="update-project">${esc(project.title)}</a>${
              clientOf(project) ? `<div class="small muted">${clientOf(project)}</div>` : ''
            }</div>`
          : ''
      }
      <div class="update-status">${pill(u.status)}${statusChanged ? `<span class="muted small">changed from ${pill(u.previousStatus)}</span>` : ''}</div>
      <div class="meta">${personLink(u.author, 20)}${external(u.url, timeAgo(u.createdAt), 'muted')}</div>
    </header>
    <div class="markdown">${md(u.body)}</div>
    ${u.next ? `<h4 class="subhead">Next steps</h4><div class="markdown">${md(u.next)}</div>` : ''}
    ${
      dateChanged
        ? `<p class="date-change">Target date ${u.previousTargetDate ? `moved from ${esc(formatDay(u.previousTargetDate))} to ` : 'set to '}<strong>${esc(formatDay(u.targetDate))}</strong></p>`
        : ''
    }
    ${reactions(u.reactions, u.url)}
    ${comments(u.comments, u.url)}
  </article>`;
}

const targetDateCell = p =>
  p.targetDate
    ? `<span class="${isPast(p.targetDate) && isActive(p) ? 'overdue' : ''}">${esc(formatDay(p.targetDate))}</span>`
    : '<span class="muted">Not set</span>';

const lastUpdateCell = p => (p.lastUpdateAt ? timeAgo(p.lastUpdateAt) : '<span class="muted">Never</span>');

// ---------- pages ----------

function feedPage() {
  const showFollowing = Boolean(me) && feedScope === 'following';
  const following = new Set(data.projects.filter(p => isFollower(p, me)).map(p => p.number));
  const weeks = new Map();
  for (const u of data.updates) {
    if (showFollowing && !following.has(u.project)) continue;
    const start = weekStart(u.createdAt);
    const key = start.toISOString();
    if (!weeks.has(key)) weeks.set(key, { start, updates: [] });
    weeks.get(key).updates.push(u);
  }
  const myDue = me ? data.projects.filter(p => p.dueForUpdate && sameLogin(p.owner, me)) : [];

  return `
    <div class="page-head">
      <h1>Updates</h1>
      ${
        me
          ? `<div class="segmented">
              <button data-scope="following" class="${showFollowing ? 'active' : ''}">Following</button>
              <button data-scope="all" class="${showFollowing ? '' : 'active'}">All</button>
            </div>`
          : ''
      }
    </div>
    ${me ? '' : '<div class="callout">Pick your name under <strong>Viewing as</strong> to see the projects you follow.</div>'}
    ${
      myDue.length
        ? `<div class="callout callout-warn"><strong>Your weekly update is due</strong><ul class="due-list">${myDue
            .map(
              p => `<li><a href="#/projects/${p.number}">${esc(p.title)}</a>${external(links().postUpdate(p), 'Post update', 'btn btn-small')}</li>`,
            )
            .join('')}</ul></div>`
        : ''
    }
    ${
      weeks.size
        ? [...weeks.values()]
            .map(
              w => `<section class="week">
                <h2 class="week-title">Week of ${esc(formatDate(w.start))}</h2>
                ${w.updates.map(u => updateCard(u, true)).join('')}
              </section>`,
            )
            .join('')
        : empty(
            showFollowing
              ? 'Nothing from the projects you follow yet. Browse <a href="#/projects">projects</a> and react with 👀 on one to follow it.'
              : 'No updates have been posted yet.',
          )
    }`;
}

function projectsPage() {
  const tagOptions = [...new Set(data.projects.flatMap(p => p.tags))].sort();
  const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
  return `
    <div class="page-head"><h1>Projects</h1></div>
    <div class="filters">
      <input type="search" data-filter="query" placeholder="Search projects" value="${esc(filters.query)}">
      <select data-filter="status" aria-label="Status">
        ${option('', 'All statuses', !filters.status)}
        ${Object.entries(STATUS).map(([key, s]) => option(key, s.label, filters.status === key)).join('')}
      </select>
      ${
        data.clients.length
          ? `<select data-filter="client" aria-label="Client">${option('', 'All clients', !filters.client)}${option(
              'none',
              'No client',
              filters.client === 'none',
            )}${data.clients.map(c => option(String(c.number), c.title, filters.client === String(c.number))).join('')}</select>`
          : ''
      }
      ${
        tagOptions.length
          ? `<select data-filter="tag" aria-label="Tag">${option('', 'All tags', !filters.tag)}${tagOptions
              .map(t => option(t, t, filters.tag === t))
              .join('')}</select>`
          : ''
      }
      ${me ? `<label class="check"><input type="checkbox" data-filter="followingOnly"${filters.followingOnly ? ' checked' : ''}> Following</label>` : ''}
      <label class="check"><input type="checkbox" data-filter="showClosed"${filters.showClosed ? ' checked' : ''}> Show completed</label>
    </div>
    <div id="projects-table">${projectsTable()}</div>`;
}

const matchesClient = (p, filter) =>
  !filter || (filter === 'none' ? p.client === null && !p.clientRef : String(p.client) === filter);

function projectsTable() {
  const q = filters.query.toLowerCase();
  const projects = data.projects
    .filter(p => filters.showClosed || isActive(p))
    .filter(p => !filters.status || p.status === filters.status)
    .filter(p => matchesClient(p, filters.client))
    .filter(p => !filters.tag || p.tags.includes(filters.tag))
    .filter(p => !filters.followingOnly || !me || isFollower(p, me))
    .filter(p => {
      const client = data.clientsByNumber.get(p.client)?.title ?? p.clientRef;
      return !q || `${p.title} ${p.summary} ${p.owner} ${client}`.toLowerCase().includes(q);
    });
  if (!projects.length) return empty('No projects match.');
  return projectRows(projects);
}

function projectRows(projects, { showClient = true } = {}) {
  const sorted = [...projects].sort((a, b) => STATUS[a.status].order - STATUS[b.status].order || a.title.localeCompare(b.title));
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Project</th>${showClient ? '<th>Client</th>' : ''}<th>Status</th><th>Owner</th><th>Target date</th><th>Last update</th></tr></thead>
    <tbody>${sorted
      .map(
        p => `<tr>
          <td><a href="#/projects/${p.number}" class="strong">${esc(p.title)}</a>${tags(p.tags)}</td>
          ${showClient ? `<td>${clientOf(p) || '<span class="muted">–</span>'}</td>` : ''}
          <td>${pill(p.status)}</td>
          <td>${personLink(p.owner)}</td>
          <td>${targetDateCell(p)}</td>
          <td>${lastUpdateCell(p)}${p.dueForUpdate ? '<span class="due-badge">Due</span>' : ''}</td>
        </tr>`,
      )
      .join('')}</tbody>
  </table></div>`;
}

function projectPage(number) {
  const p = data.projectsByNumber.get(number);
  if (!p) return '<p>Project not found.</p>';
  const updates = data.updatesByProject.get(p.number) ?? [];
  const following = me && isFollower(p, me);

  return `<div class="detail-head">
      <span class="muted small">#${p.number}</span>
      <h1>${esc(p.title)}</h1>
      <div class="detail-status">${pill(p.status)}${p.dueForUpdate ? '<span class="due-badge">Update due</span>' : ''}</div>
    </div>
    <div class="detail">
    <div class="detail-main">
      <section class="card">
        <h3 class="subhead">What</h3>
        ${p.summary ? `<div class="markdown">${md(p.summary)}</div>` : '<p class="muted">No summary.</p>'}
        ${p.why ? `<h3 class="subhead">Why</h3><div class="markdown">${md(p.why)}</div>` : ''}
        ${reactions(p.reactions, p.url)}
      </section>
      <h2 class="section-title">Updates</h2>
      ${updates.length ? updates.map(u => updateCard(u)).join('') : empty('No updates yet.')}
      <h2 class="section-title">Discussion</h2>
      <div class="card">${comments(p.comments, p.url, true)}</div>
    </div>
    <aside class="detail-side">
      <div class="card side-card">
        ${isActive(p) ? external(links().postUpdate(p), 'Post update', 'btn btn-primary btn-block') : ''}
        ${external(p.url, following ? 'Following 👀' : 'Follow (react 👀)', 'btn btn-block')}
        ${external(p.url, 'Edit details on GitHub', 'btn btn-block')}
        <dl class="facts">
          ${clientOf(p) ? `<dt>Client</dt><dd>${clientOf(p)}</dd>` : ''}
          <dt>Owner</dt><dd>${personLink(p.owner)}</dd>
          ${p.contributors.length ? `<dt>Contributors</dt><dd class="stack">${p.contributors.map(l => personLink(l)).join('')}</dd>` : ''}
          <dt>Target date</dt><dd>${targetDateCell(p)}</dd>
          <dt>Last update</dt><dd>${lastUpdateCell(p)}</dd>
          <dt>Followers (${p.followers.length})</dt><dd>${avatarStack(p.followers)}</dd>
          ${p.tags.length ? `<dt>Tags</dt><dd>${tags(p.tags)}</dd>` : ''}
          <dt>Started</dt><dd>${timeAgo(p.createdAt)}</dd>
        </dl>
      </div>
    </aside>
  </div>`;
}

function clientsPage() {
  const card = c => {
    const projects = data.projectsByClient.get(c.number) ?? [];
    const active = projects.filter(isActive);
    const counts = Object.keys(STATUS)
      .map(s => [s, active.filter(p => p.status === s).length])
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `${pill(s)} ${n}`)
      .join(' ');
    return `<a href="#/clients/${c.number}" class="card client-card">
      <div class="strong">${esc(c.title)}</div>
      <div class="muted small">${active.length} active project${active.length === 1 ? '' : 's'}${
        projects.length > active.length ? ` · ${projects.length - active.length} completed` : ''
      }</div>
      ${counts ? `<div class="status-counts">${counts}</div>` : ''}
    </a>`;
  };
  const current = data.clients.filter(c => c.state === 'open');
  const former = data.clients.filter(c => c.state !== 'open');

  return `<div class="page-head">
      <h1>Clients</h1>
      ${external(links().newClient, 'New client', 'btn')}
    </div>
    ${current.length ? `<div class="people-grid">${current.map(card).join('')}</div>` : empty('No clients yet. Add one with <strong>New client</strong>.')}
    ${former.length ? `<h2 class="section-title">Former clients</h2><div class="people-grid">${former.map(card).join('')}</div>` : ''}`;
}

function clientPage(number) {
  const c = data.clientsByNumber.get(number);
  if (!c) return '<p>Client not found.</p>';
  const projects = data.projectsByClient.get(c.number) ?? [];
  const active = projects.filter(isActive);
  const completed = projects.filter(p => !isActive(p));
  const projectNumbers = new Set(projects.map(p => p.number));
  const updates = data.updates.filter(u => projectNumbers.has(u.project)).slice(0, 10);

  return `<div class="detail-head">
      <span class="muted small">#${c.number}</span>
      <h1>${esc(c.title)}</h1>
      ${c.state === 'open' ? '' : '<div class="detail-status"><span class="pill">Former client</span></div>'}
    </div>
    <div class="detail">
      <div class="detail-main">
        <section class="card">
          <h3 class="subhead">About</h3>
          ${c.about ? `<div class="markdown">${md(c.about)}</div>` : '<p class="muted">No description.</p>'}
          ${reactions(c.reactions, c.url)}
        </section>
        <h2 class="section-title">Projects</h2>
        ${active.length ? projectRows(active, { showClient: false }) : empty('No active projects.')}
        ${completed.length ? `<h2 class="section-title">Completed</h2>${projectRows(completed, { showClient: false })}` : ''}
        <h2 class="section-title">Recent updates</h2>
        ${updates.length ? updates.map(u => updateCard(u, true)).join('') : empty('No updates yet.')}
        <h2 class="section-title">Discussion</h2>
        <div class="card">${comments(c.comments, c.url, true)}</div>
      </div>
      <aside class="detail-side">
        <div class="card side-card">
          ${c.state === 'open' ? external(links().newClientProject(c), 'New project for this client', 'btn btn-primary btn-block') : ''}
          ${external(c.url, 'Edit details on GitHub', 'btn btn-block')}
          <dl class="facts">
            ${c.lead ? `<dt>Client lead</dt><dd>${personLink(c.lead)}</dd>` : ''}
            ${c.website ? `<dt>Website</dt><dd>${external(c.website, esc(c.website.replace(/^https?:\/\/|\/$/g, '')))}</dd>` : ''}
            <dt>Projects</dt><dd>${active.length} active, ${completed.length} completed</dd>
            <dt>Added</dt><dd>${timeAgo(c.createdAt)}</dd>
          </dl>
        </div>
      </aside>
    </div>`;
}

function peoplePage() {
  const active = data.projects.filter(isActive);
  const cards = data.people
    .map(person => {
      const owns = active.filter(p => sameLogin(p.owner, person.login)).length;
      const follows = active.filter(p => isFollower(p, person.login)).length;
      return `<a href="#/people/${encodeURIComponent(person.login)}" class="card person-card">
        ${avatar(person.login, 48)}
        <div>
          <div class="strong">${esc(person.name)}</div>
          <div class="muted small">${esc(person.team || `@${person.login}`)}</div>
          <div class="muted small">Owns ${owns} · follows ${follows}</div>
        </div>
      </a>`;
    })
    .join('');
  return `<div class="page-head"><h1>People</h1></div>
    ${data.people.length ? `<div class="people-grid">${cards}</div>` : empty('Add the team to config/people.json.')}`;
}

function personPage(login) {
  const person = personOf(login) ?? { login, name: login };
  const active = data.projects.filter(isActive);
  const owns = active.filter(p => sameLogin(p.owner, login));
  const contributes = active.filter(p => p.contributors.some(c => sameLogin(c, login)));
  const follows = active.filter(p => isFollower(p, login) && !owns.includes(p) && !contributes.includes(p));
  const updates = data.updates.filter(u => sameLogin(u.author, login)).slice(0, 10);

  const list = (title, projects) =>
    projects.length
      ? `<h2 class="section-title">${title}</h2><ul class="card plain-list">${projects
          .map(p => `<li><a href="#/projects/${p.number}">${esc(p.title)}</a>${pill(p.status)}</li>`)
          .join('')}</ul>`
      : '';

  return `<div class="person-head">
      ${avatar(person.login, 64)}
      <div>
        <h1>${esc(person.name)}</h1>
        <div class="muted">${person.team ? `${esc(person.team)} · ` : ''}${external(`https://github.com/${encodeURIComponent(person.login)}`, `@${esc(person.login)}`)}</div>
      </div>
    </div>
    ${list('Owns', owns)}
    ${list('Contributes to', contributes)}
    ${list('Follows', follows)}
    <h2 class="section-title">Recent updates</h2>
    ${updates.length ? updates.map(u => updateCard(u, true)).join('') : empty('No updates posted yet.')}`;
}

// ---------- routing and events ----------

function render() {
  const path = location.hash.replace(/^#/, '') || '/';
  let section = '';
  let html;
  let m;
  if (path === '/') {
    section = 'updates';
    html = feedPage();
  } else if (path === '/projects') {
    section = 'projects';
    html = projectsPage();
  } else if ((m = path.match(/^\/projects\/(\d+)$/))) {
    section = 'projects';
    html = projectPage(Number(m[1]));
  } else if (path === '/clients') {
    section = 'clients';
    html = clientsPage();
  } else if ((m = path.match(/^\/clients\/(\d+)$/))) {
    section = 'clients';
    html = clientPage(Number(m[1]));
  } else if (path === '/people') {
    section = 'people';
    html = peoplePage();
  } else if ((m = path.match(/^\/people\/([^/]+)$/))) {
    section = 'people';
    html = personPage(decodeURIComponent(m[1]));
  } else {
    html = '<p>Page not found.</p>';
  }
  app.innerHTML = html;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === section));
}

app.addEventListener('click', e => {
  const scope = e.target.closest('[data-scope]');
  if (scope) {
    feedScope = scope.dataset.scope;
    render();
  }
});

app.addEventListener('input', e => {
  const key = e.target.dataset?.filter;
  if (!key) return;
  filters[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  document.getElementById('projects-table').innerHTML = projectsTable();
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

function index(raw) {
  const updatesByProject = new Map();
  for (const u of raw.updates) {
    if (!updatesByProject.has(u.project)) updatesByProject.set(u.project, []);
    updatesByProject.get(u.project).push(u);
  }
  const clients = raw.clients ?? [];
  const projectsByClient = new Map();
  for (const p of raw.projects) {
    if (p.client === null || p.client === undefined) continue;
    if (!projectsByClient.has(p.client)) projectsByClient.set(p.client, []);
    projectsByClient.get(p.client).push(p);
  }
  return {
    ...raw,
    clients,
    clientsByNumber: new Map(clients.map(c => [c.number, c])),
    projectsByClient,
    projectsByNumber: new Map(raw.projects.map(p => [p.number, p])),
    peopleByLogin: new Map(raw.people.map(p => [p.login.toLowerCase(), p])),
    updatesByProject,
  };
}

function setupHeader() {
  const select = document.getElementById('me');
  select.innerHTML =
    '<option value="">Viewing as…</option>' +
    data.people.map(p => `<option value="${esc(p.login)}"${sameLogin(p.login, me) ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  select.addEventListener('change', () => {
    saveMe(select.value);
    render();
  });
  document.getElementById('new-project').href = links().newProject;
  document.getElementById('topbar-actions').hidden = false;
  document.getElementById('footer').innerHTML =
    `Refreshed ${timeAgo(data.generatedAt)} · new posts and comments appear within a couple of minutes, reactions within the hour · ${external(links().repo, 'GitHub repo')}`;
}

fetch('data.json', { cache: 'no-store' })
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then(raw => {
    data = index(raw);
    setupHeader();
    render();
  })
  .catch(err => {
    app.innerHTML = `<div class="callout callout-error">Couldn't load the project data (${esc(err.message)}).</div>`;
  });
