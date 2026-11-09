export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim();
    const REPO_OWNER = (process.env.REPO_OWNER || '').trim();
    const REPO_NAME = (process.env.REPO_NAME || '').trim();
    const BRANCH = (process.env.GITHUB_BRANCH || 'main').trim();

    if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
      return res.status(500).json({ 
        error: 'Vercel API Error: Missing Environment Variables',
        details: `GITHUB_TOKEN Present: ${!!GITHUB_TOKEN}, REPO_OWNER: "${REPO_OWNER}", REPO_NAME: "${REPO_NAME}"`
      });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    const type = req.query?.type || body.type;
    if (!type || (type !== 'cooked' && type !== 'sold')) {
      return res.status(400).json({ 
        error: 'Vercel API Error: Bad Request', 
        details: 'Missing or invalid "type" parameter (must be "cooked" or "sold").' 
      });
    }

    const targetFile = type === 'cooked' ? 'cooked.json' : 'sold.json';
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${targetFile}`;
    
    const headers = {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'sopno-fast-food-app'
    };

    // GET Request
    if (req.method === 'GET') {
      const response = await fetch(`${url}?ref=${BRANCH}`, { headers, cache: 'no-store' });
      const responseText = await response.text();

      if (!response.ok) {
        if (response.status === 404) return res.status(200).json([]);
        return res.status(response.status).json({ 
          error: `Vercel API: GitHub Read Failed (${response.status})`, 
          details: responseText 
        });
      }

      const fileData = JSON.parse(responseText);
      const cleanBase64 = fileData.content.replace(/\n/g, '');
      const content = Buffer.from(cleanBase64, 'base64').toString('utf-8');
      return res.status(200).json(JSON.parse(content));
    }

    // POST Request
    if (req.method === 'POST') {
      const log = body.log;
      if (!log) {
        return res.status(400).json({ error: 'Vercel API Error: Missing log payload' });
      }

      const getFileRes = await fetch(`${url}?ref=${BRANCH}`, { headers, cache: 'no-store' });
      let logsList = [];
      let fileSha = null;

      if (getFileRes.ok) {
        const fileData = await getFileRes.json();
        fileSha = fileData.sha;
        const cleanBase64 = fileData.content.replace(/\n/g, '');
        try {
          logsList = JSON.parse(Buffer.from(cleanBase64, 'base64').toString('utf-8'));
        } catch (e) {
          logsList = [];
        }
      } else if (getFileRes.status !== 404) {
        const errText = await getFileRes.text();
        return res.status(getFileRes.status).json({ 
          error: `Vercel API: GitHub SHA Fetch Failed (${getFileRes.status})`, 
          details: errText 
        });
      }

      if (!Array.isArray(logsList)) logsList = [];
      logsList.push(log);

      const updatedBase64 = Buffer.from(JSON.stringify(logsList, null, 2), 'utf-8').toString('base64');
      const putBody = {
        message: `Update ${targetFile}: Added new ${type} entry`,
        content: updatedBase64,
        branch: BRANCH
      };
      if (fileSha) putBody.sha = fileSha;

      const updateRes = await fetch(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody)
      });

      const responseText = await updateRes.text();

      if (updateRes.ok) {
        return res.status(200).json({ success: true, logs: logsList });
      } else {
        return res.status(updateRes.status).json({ 
          error: `Vercel API: GitHub Commit Failed (${updateRes.status})`, 
          details: responseText 
        });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Vercel API Server Crash', 
      details: error.message 
    });
  }
}
