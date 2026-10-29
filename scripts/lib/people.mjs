import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PEOPLE_FILE = fileURLToPath(new URL('../../config/people.json', import.meta.url));

// GitHub's author_association values for people with access to the repo.
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

export function loadPeople() {
  const { people = [] } = JSON.parse(readFileSync(PEOPLE_FILE, 'utf8'));
  return people.filter(p => p.login);
}

// The repo is public, so anyone can open issues. Only the team's content is used.
export function createAllowList(people) {
  const logins = new Set(people.map(p => p.login.toLowerCase()));
  return (login, association) =>
    Boolean(login) && (logins.has(login.toLowerCase()) || TRUSTED_ASSOCIATIONS.has(association));
}

// login -> email, from the PEOPLE_EMAILS secret ({"octocat": "octo@datagambit.co.za"}).
export function loadEmails() {
  const raw = JSON.parse(process.env.PEOPLE_EMAILS || '{}');
  return new Map(Object.entries(raw).map(([login, email]) => [login.toLowerCase(), email]));
}
