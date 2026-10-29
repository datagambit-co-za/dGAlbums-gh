// Creates the labels the issue forms rely on. Issue forms silently drop labels that don't exist.
import { createClient, requireRepo } from './lib/github.mjs';

const LABELS = [
  { name: 'project', color: '0c66e4', description: 'A project tracked in dG Albums' },
  { name: 'status-update', color: '22a06b', description: 'A weekly status update' },
];

const repo = requireRepo();
const api = createClient();
for (const label of LABELS) {
  try {
    await api.post(`/repos/${repo}/labels`, label);
    console.log(`Created label ${label.name}`);
  } catch (err) {
    if (err.status !== 422) throw err; // 422: already exists
  }
}
