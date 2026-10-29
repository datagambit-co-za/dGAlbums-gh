// Runs when a status-update issue is opened or edited: checks it, links it to
// its project and closes it. Comments and reactions on it still show on the site.
import { readFileSync } from 'node:fs';
import { createClient, requireRepo } from './lib/github.mjs';
import { UPDATE_FIELDS, normalizeStatus, parseForm, parseProjectRef } from './lib/forms.mjs';
import { createAllowList, loadPeople } from './lib/people.mjs';
import { siteUrl } from './build-data.mjs';

const repo = requireRepo();
const api = createClient();
const { issue } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));

if (issue.state !== 'open' || !issue.labels.some(l => l.name === 'status-update')) process.exit(0);

const isAllowed = createAllowList(loadPeople());
const fields = parseForm(issue.body, UPDATE_FIELDS);
const problems = [];

if (!isAllowed(issue.user.login, issue.author_association)) {
  problems.push(`@${issue.user.login} isn't in \`config/people.json\`, so this update won't be shown.`);
}

const ref = parseProjectRef(fields.project);
let project = null;
if (!ref) {
  problems.push('The **Project** field needs the project\'s issue number, for example `#12`.');
} else {
  try {
    project = await api.get(`/repos/${repo}/issues/${ref}`);
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  if (!project?.labels.some(l => l.name === 'project')) {
    problems.push(`#${ref} isn't a project. Projects are issues with the \`project\` label.`);
    project = null;
  }
}

const status = normalizeStatus(fields.status);
if (!status) problems.push('Choose a **Status**.');
if (!fields.update) problems.push('The **Update** field is empty.');

const comment = body => api.post(`/repos/${repo}/issues/${issue.number}/comments`, { body });

if (problems.length) {
  await comment(
    `This update couldn't be posted yet:\n\n${problems.map(p => `- ${p}`).join('\n')}\n\nEdit the issue to fix it and it will be checked again.`,
  );
  process.exit(0);
}

const link = `${siteUrl(repo)}#/projects/${project.number}`;
await comment(`Posted to [${project.title}](${link}). Comments and reactions on this issue show on the update.`);
await api.patch(`/repos/${repo}/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' });

if (status === 'done' && project.state === 'open') {
  await api.post(`/repos/${repo}/issues/${project.number}/comments`, {
    body: `Marked as done by status update #${issue.number}.`,
  });
  await api.patch(`/repos/${repo}/issues/${project.number}`, { state: 'closed', state_reason: 'completed' });
}
console.log(`Linked update #${issue.number} to project #${project.number} (${status})`);
