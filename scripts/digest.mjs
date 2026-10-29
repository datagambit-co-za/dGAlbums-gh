// Monday digest: emails each person the past week's updates for the projects they follow
// (as owner, contributor or 👀 reaction), plus the projects that missed their update.
import { collectData } from './build-data.mjs';
import { button, createMailer, escapeHtml, layout, statusBadge, summary, textBlock } from './lib/mail.mjs';
import { loadEmails } from './lib/people.mjs';

const WEEK = 7 * 24 * 60 * 60 * 1000;

const data = await collectData();
const emails = loadEmails();
const mailer = await createMailer();
const since = Date.now() - WEEK;
const projectsByNumber = new Map(data.projects.map(p => [p.number, p]));
const nameOf = login => data.people.find(p => p.login.toLowerCase() === login.toLowerCase())?.name ?? login;
const projectUrl = p => `${data.siteUrl}#/projects/${p.number}`;

summary(`## Weekly digest${mailer.dryRun ? ' (dry run)' : ''}\n`);

let sent = 0;
for (const person of data.people) {
  const email = emails.get(person.login.toLowerCase());
  if (!email) continue;

  const followed = data.projects.filter(p => p.followers.some(f => f.toLowerCase() === person.login.toLowerCase()));
  const followedNumbers = new Set(followed.map(p => p.number));
  const updates = data.updates.filter(u => followedNumbers.has(u.project) && Date.parse(u.createdAt) >= since);
  const missing = followed.filter(p => p.dueForUpdate);
  if (!updates.length && !missing.length) continue;

  const updateHtml = updates
    .map(u => {
      const p = projectsByNumber.get(u.project);
      const changed = u.previousStatus && u.previousStatus !== u.status ? ` <span style="font-size:12px;color:#626f86">changed from</span> ${statusBadge(u.previousStatus)}` : '';
      const comments = u.comments.length ? ` · ${u.comments.length} comment${u.comments.length > 1 ? 's' : ''}` : '';
      return `<div style="background:#fff;border:1px solid #dcdfe4;border-radius:8px;padding:16px;margin-bottom:12px">
<a href="${projectUrl(p)}" style="font-weight:600;color:#0c66e4;text-decoration:none">${escapeHtml(p.title)}</a>
<div style="margin:6px 0 10px">${statusBadge(u.status)}${changed}</div>
${textBlock(u.body)}
${u.next ? `<div style="margin-top:10px;font-size:13px;font-weight:600;color:#44546f">Next</div>${textBlock(u.next)}` : ''}
<div style="font-size:12px;color:#626f86;margin-top:10px">${escapeHtml(nameOf(u.author))}${comments} · <a href="${u.url}" style="color:#0c66e4">Comment or react</a></div>
</div>`;
    })
    .join('');

  const missingHtml = missing.length
    ? `<h2 style="font-size:16px;color:#172b4d;margin:24px 0 8px">No update this week</h2><ul style="color:#172b4d;padding-left:20px">${missing
        .map(p => `<li><a href="${projectUrl(p)}" style="color:#0c66e4">${escapeHtml(p.title)}</a> (${escapeHtml(nameOf(p.owner))})</li>`)
        .join('')}</ul>`
    : '';

  await mailer.send({
    to: email,
    subject: `Your weekly project digest: ${updates.length} update${updates.length === 1 ? '' : 's'}`,
    html: layout(
      `Hi ${person.name}, here's what happened this week`,
      `${updateHtml || '<p style="color:#172b4d">No updates on the projects you follow this week.</p>'}${missingHtml}<p style="margin-top:20px">${button(data.siteUrl, 'Open dG Albums')}</p>`,
      data.siteUrl,
    ),
    text: updates.map(u => `${projectsByNumber.get(u.project).title} (${u.status}): ${u.body}`).join('\n\n'),
  });
  sent++;
}
summary(`${sent} digest(s) ${mailer.dryRun ? 'prepared' : 'sent'}.`);
