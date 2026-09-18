const ignoredOwners = new Set(['features', 'topics', 'marketplace', 'orgs', 'pricing', 'login', 'signup']);

export function extractGithubRepositoryUrls(text: string, limit = 5) {
  const repositoryUrlRegex = /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?=$|[\s/#?!)])/g;
  const urls = new Set<string>();
  let match: RegExpExecArray | null;

  while (urls.size < limit && (match = repositoryUrlRegex.exec(text))) {
    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');
    if (!owner || !repo || ignoredOwners.has(owner.toLowerCase())) continue;
    urls.add(`https://github.com/${owner}/${repo}`);
  }

  return [...urls];
}
