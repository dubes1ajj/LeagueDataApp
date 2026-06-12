const DEFAULT_REPO_OWNER = 'dubes1ajj';
const DEFAULT_REPO_NAME = 'CarringtonLeagueData';
const DEFAULT_REPO_BRANCH = 'main';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-admin-pin',
    },
    body: JSON.stringify(body),
  };
}

async function readGitHubError(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed?.message) {
      return parsed.message;
    }
  } catch {
    // fall through to raw text
  }
  return text;
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const githubToken = process.env.GITHUB_DATA_TOKEN;
  if (!githubToken) {
    return json(500, { error: 'Missing GITHUB_DATA_TOKEN environment variable.' });
  }

  const publishPin = process.env.PUBLISH_ADMIN_PIN;
  if (publishPin) {
    const providedPin = event.headers['x-admin-pin'] ?? event.headers['X-Admin-Pin'];
    if (providedPin !== publishPin) {
      return json(401, { error: 'Invalid publish PIN.' });
    }
  }

  let payload;
  try {
    payload = JSON.parse(event.body ?? '{}');
  } catch {
    return json(400, { error: 'Request body must be valid JSON.' });
  }

  const leagueId = typeof payload.leagueId === 'string' ? payload.leagueId.trim() : '';
  const snapshot = payload.snapshot;
  if (!leagueId || !snapshot?.league) {
    return json(400, { error: 'leagueId and snapshot.league are required.' });
  }

  const repoOwner = process.env.GITHUB_DATA_REPO_OWNER ?? DEFAULT_REPO_OWNER;
  const repoName = process.env.GITHUB_DATA_REPO_NAME ?? DEFAULT_REPO_NAME;
  const repoBranch = process.env.GITHUB_DATA_REPO_BRANCH ?? DEFAULT_REPO_BRANCH;
  const repoPathPrefix = (process.env.GITHUB_DATA_PATH_PREFIX ?? '').replace(/^\/+|\/+$/g, '');
  const filePath = `${repoPathPrefix ? `${repoPathPrefix}/` : ''}${leagueId}.json`;
  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;

  const authHeaders = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'GolfTracker-Netlify-Function',
  };

  let existingSha;
  const existingRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(repoBranch)}`, {
    headers: authHeaders,
  });
  if (existingRes.ok) {
    const existingJson = await existingRes.json();
    existingSha = existingJson.sha;
  } else if (existingRes.status !== 404) {
    const errorText = await readGitHubError(existingRes);
    return json(502, { error: 'Failed to read existing file from GitHub.', details: errorText });
  }

  const content = Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8').toString('base64');
  const message = payload.commitMessage
    || `Publish ${leagueId}.json from GolfTracker (${new Date().toISOString()})`;

  const updateRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content,
      branch: repoBranch,
      sha: existingSha,
    }),
  });

  if (!updateRes.ok) {
    const errorText = await readGitHubError(updateRes);
    return json(502, { error: 'Failed to publish snapshot to GitHub.', details: errorText });
  }

  const updateJson = await updateRes.json();
  return json(200, {
    ok: true,
    filePath,
    commitSha: updateJson.commit?.sha ?? null,
    commitUrl: updateJson.commit?.html_url ?? null,
  });
}