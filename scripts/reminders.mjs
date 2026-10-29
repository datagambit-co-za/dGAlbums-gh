// Friday reminder: emails each owner whose projects have no update this week.
// Owners without an email in PEOPLE_EMAILS get an @mention on the project issue instead.
import { collectData } from './build-data.mjs';
import { createClient } from './lib/github.mjs';
import { button, createMailer, escapeHtml, layout, statusBadge, summary } from './lib/mail.mjs';
import { loadEmails } from './lib/people.mjs';

const data = await collectData();
const emails = loadEmails();
const mailer = await createMailer();
const api = createClient();

const postUpdateUrl = p =>
  `https://github.com/${data.repo}/issues/new?${new URLSearchParams({
    template: 'status-update.yml',
    title: `Update: ${p.title}`,
    project: String(p.number),
  })}`;

const byOwner = new Map();
for (const p of data.projects.filter(p => p.dueForUpdate)) {
  const key = p.owner.toLowerCase();
  if (!byOwner.has(key)) byOwner.set(key, { login: p.owner, projects: [] });
  byOwner.get(key).projects.push(p);
}

summary(`## Update reminders${mailer.dryRun ? ' (dry run)' : ''}\n\n${byOwner.size} owner(s) with projects due.\n`);

for (const [key, { login, projects }] of byOwner) {
  const email = emails.get(key);
  if (!email) {
    if (mailer.dryRun) {
      console.log(`[dry run] Would mention @${login} on ${projects.map(p => `#${p.number}`).join(', ')}`);
      continue;
    }
    for (const p of projects) {
      await api.post(`/repos/${data.repo}/issues/${p.number}/comments`, {
        body: `@${login}, it's time for this week's update. [Post update](${postUpdateUrl(p)})`,
      });
    }
    continue;
  }

  const person = data.people.find(x => x.login.toLowerCase() === key);
  const rows = projects
    .map(
      p => `<div style="background:#fff;border:1px solid #dcdfe4;border-radius:8px;padding:16px;margin-bottom:12px">
<div style="font-weight:600;color:#172b4d;margin-bottom:6px">${escapeHtml(p.title)}</div>
<div style="font-size:13px;color:#626f86;margin-bottom:12px">${statusBadge(p.status)} &nbsp;Last update: ${
        p.lastUpdateAt ? new Date(p.lastUpdateAt).toDateString() : 'never'
      }</div>
${button(postUpdateUrl(p), 'Post update')}
</div>`,
    )
    .join('');
  await mailer.send({
    to: email,
    subject: `Time for your weekly update (${projects.length} project${projects.length > 1 ? 's' : ''})`,
    html: layout(
      `Hi ${person?.name ?? login}, your weekly update is due`,
      `<p style="color:#172b4d">A few lines on how things are going helps everyone stay in the loop.</p>${rows}`,
      data.siteUrl,
    ),
    text: projects.map(p => `${p.title}: ${postUpdateUrl(p)}`).join('\n'),
  });
}
