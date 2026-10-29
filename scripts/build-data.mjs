// Reads clients, projects, status updates, comments and reactions from GitHub Issues
// and writes site/data.json for the site. Also used by the reminder and digest jobs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient, requireRepo } from './lib/github.mjs';
import {
  CLIENT_FIELDS,
  PROJECT_FIELDS,
  UPDATE_FIELDS,
  normalizeStatus,
  parseDate,
  parseForm,
  parseLogins,
  parseProjectRef,
  parseTags,
  parseWebsite,
} from './lib/forms.mjs';
import { createAllowList, loadPeople } from './lib/people.mjs';

const DAY = 24 * 60 * 60 * 1000;
export const UPDATE_DUE_AFTER_DAYS = 5;

const REACTIONS = ['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'];

const hasLabel = (issue, name) => issue.labels.some(l => (typeof l === 'string' ? l : l.name) === name);
const reactionCounts = r => Object.fromEntries(REACTIONS.filter(k => r?.[k] > 0).map(k => [k, r[k]]));
const uniqueLogins = logins => [...new Map(logins.map(l => [l.toLowerCase(), l])).values()];

export function siteUrl(repo) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/?$/, '/');
  const [owner, name] = repo.split('/');
  return `https://${owner.toLowerCase()}.github.io/${name}/`;
}

export async function collectData({ repo = requireRepo(), now = new Date() } = {}) {
  const api = createClient();
  const configured = loadPeople();
  const isAllowed = createAllowList(configured);
  const avatars = new Map();
  const seen = user => user?.login && avatars.set(user.login.toLowerCase(), user.avatar_url);

  const [allIssues, allComments] = await Promise.all([
    api.paginate(`/repos/${repo}/issues?state=all`),
    api.paginate(`/repos/${repo}/issues/comments`),
  ]);
  const issues = allIssues.filter(i => !i.pull_request && isAllowed(i.user?.login, i.author_association));

  const commentsByIssue = new Map();
  for (const c of allComments) {
    if (c.user?.type === 'Bot' || !isAllowed(c.user?.login, c.author_association)) continue;
    seen(c.user);
    const number = Number(c.issue_url.split('/').pop());
    if (!commentsByIssue.has(number)) commentsByIssue.set(number, []);
    commentsByIssue.get(number).push({
      id: c.id,
      author: c.user.login,
      createdAt: c.created_at,
      url: c.html_url,
      body: c.body ?? '',
      reactions: reactionCounts(c.reactions),
    });
  }
  for (const list of commentsByIssue.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const clients = issues
    .filter(i => hasLabel(i, 'client'))
    .map(issue => {
      seen(issue.user);
      const f = parseForm(issue.body, CLIENT_FIELDS);
      return {
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        state: issue.state,
        createdAt: issue.created_at,
        lead: parseLogins(f.client_lead)[0] ?? null,
        about: f.about ?? '',
        website: parseWebsite(f.website),
        reactions: reactionCounts(issue.reactions),
        comments: commentsByIssue.get(issue.number) ?? [],
      };
    });
  const clientsByNumber = new Map(clients.map(c => [c.number, c]));
  const clientsByName = new Map(clients.map(c => [c.title.trim().toLowerCase(), c]));
  // A project's Client field holds the client's name or its issue number.
  const resolveClient = ref => {
    if (!ref) return null;
    return clientsByNumber.get(parseProjectRef(ref)) ?? clientsByName.get(ref.trim().toLowerCase()) ?? null;
  };

  const projects = [];
  for (const issue of issues.filter(i => hasLabel(i, 'project'))) {
    seen(issue.user);
    const f = parseForm(issue.body, PROJECT_FIELDS);
    const owner = parseLogins(f.owner)[0] ?? issue.user.login;
    const client = resolveClient(f.client);
    // Following = reacting with 👀 to the project's first post.
    const eyes = await api.paginate(`/repos/${repo}/issues/${issue.number}/reactions?content=eyes`);
    eyes.forEach(r => seen(r.user));
    projects.push({
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      state: issue.state,
      stateReason: issue.state_reason,
      createdAt: issue.created_at,
      closedAt: issue.closed_at,
      author: issue.user.login,
      client: client?.number ?? null,
      // What was typed when it doesn't match a client, so the site can still show it.
      clientRef: client ? '' : (f.client ?? ''),
      owner,
      contributors: parseLogins(f.contributors).filter(l => l.toLowerCase() !== owner.toLowerCase()),
      watchers: eyes.map(r => r.user?.login).filter(Boolean),
      summary: f.summary ?? '',
      why: f.why_it_matters ?? '',
      tags: parseTags(f.tags),
      initialTargetDate: parseDate(f.target_date),
      reactions: reactionCounts(issue.reactions),
      comments: commentsByIssue.get(issue.number) ?? [],
    });
  }
  const projectsByNumber = new Map(projects.map(p => [p.number, p]));

  const updates = [];
  for (const issue of issues.filter(i => hasLabel(i, 'status-update'))) {
    const f = parseForm(issue.body, UPDATE_FIELDS);
    const project = parseProjectRef(f.project);
    const status = normalizeStatus(f.status);
    if (!projectsByNumber.has(project) || !status) continue;
    seen(issue.user);
    updates.push({
      number: issue.number,
      url: issue.html_url,
      project,
      author: issue.user.login,
      createdAt: issue.created_at,
      status,
      body: f.update ?? '',
      next: f.next_steps ?? '',
      targetDate: parseDate(f.new_target_date),
      reactions: reactionCounts(issue.reactions),
      comments: commentsByIssue.get(issue.number) ?? [],
    });
  }
  updates.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const p of projects) {
    const list = updates.filter(u => u.project === p.number);
    let previousStatus = null;
    let targetDate = p.initialTargetDate;
    for (const u of list) {
      u.previousStatus = previousStatus;
      u.previousTargetDate = targetDate;
      previousStatus = u.status;
      if (u.targetDate) targetDate = u.targetDate;
    }
    const latest = list.at(-1);
    p.targetDate = targetDate;
    p.updateCount = list.length;
    p.lastUpdateAt = latest?.createdAt ?? null;
    p.status =
      p.state === 'closed' ? (p.stateReason === 'not_planned' ? 'archived' : 'done') : (latest?.status ?? 'pending');
    p.followers = uniqueLogins([p.owner, ...p.contributors, ...p.watchers]);
    p.dueForUpdate =
      p.state === 'open' &&
      !['paused', 'done'].includes(p.status) &&
      (!latest || now - Date.parse(latest.createdAt) > UPDATE_DUE_AFTER_DAYS * DAY);
  }

  // Everyone in config/people.json, plus anyone the projects and clients mention.
  const people = new Map(configured.map(p => [p.login.toLowerCase(), { ...p }]));
  const mentioned = [
    ...projects.flatMap(p => [p.owner, ...p.contributors]),
    ...updates.map(u => u.author),
    ...clients.map(c => c.lead).filter(Boolean),
  ];
  for (const login of mentioned) {
    if (!people.has(login.toLowerCase())) people.set(login.toLowerCase(), { login, name: login });
  }
  for (const [key, person] of people) {
    person.avatar = avatars.get(key) ?? `https://github.com/${person.login}.png?size=96`;
    person.name ||= person.login;
  }

  return {
    generatedAt: now.toISOString(),
    repo,
    siteUrl: siteUrl(repo),
    updateDueAfterDays: UPDATE_DUE_AFTER_DAYS,
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
    clients: clients.sort((a, b) => a.title.localeCompare(b.title)),
    projects: projects.sort((a, b) => a.title.localeCompare(b.title)),
    updates: updates.reverse(),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = await collectData();
  const out = fileURLToPath(new URL('../site/data.json', import.meta.url));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(data, null, 2));
  console.log(`Wrote ${data.projects.length} projects and ${data.updates.length} updates to site/data.json`);
}
