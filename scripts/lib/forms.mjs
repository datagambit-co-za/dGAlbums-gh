// Parsing for the Markdown that GitHub issue forms produce:
//
//   ### Label
//
//   value
//
// Only known labels start a new field, so a "### " heading inside a value stays part of it.

export const PROJECT_FIELDS = ['summary', 'why_it_matters', 'owner', 'contributors', 'target_date', 'tags'];
export const UPDATE_FIELDS = ['project', 'status', 'update', 'next_steps', 'new_target_date'];

export const STATUSES = ['on-track', 'at-risk', 'off-track', 'paused', 'done'];

const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export function parseForm(body, known) {
  const fields = {};
  let current = null;
  for (const line of (body ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading && known.includes(slug(heading[1]))) {
      current = slug(heading[1]);
      fields[current] = [];
    } else if (current) {
      fields[current].push(line);
    }
  }
  for (const key of Object.keys(fields)) {
    const value = fields[key].join('\n').trim();
    fields[key] = value === '_No response_' ? '' : value;
  }
  return fields;
}

export function parseLogins(value) {
  return (value ?? '')
    .split(/[\s,;]+/)
    .map(s => s.replace(/^@/, '').trim())
    .filter(s => /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(s));
}

export function parseTags(value) {
  return (value ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

export function parseDate(value) {
  const v = (value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
}

export function parseProjectRef(value) {
  const v = String(value ?? '');
  const m = v.match(/issues\/(\d+)/) || v.match(/^\s*#?(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

export function normalizeStatus(value) {
  const s = (value ?? '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  return STATUSES.includes(s) ? s : null;
}
