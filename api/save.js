export default async function handler(req, res) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME = process.env.REPO_NAME;

  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
    return res.status(500).json({ 
      error: 'Vercel Environment Variables Missing',
      details: 'Check GITHUB_TOKEN, REPO_OWNER, and REPO_NAME in Vercel Settings.'
    });
  }

  const { type } = req.query.type ? req.query : (req.body || {});
  const targetFile = type === 'cooked' ? 'cooked.json' : 'sold.json';
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${targetFile}`;
  
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'sopno-fast-food-app'
  };

  try {
    // GET: Read cooked.json or sold.json
    if (req.method === 'GET') {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        if (response.status === 404) return res.status(200).json([]);
        const errText = await response.text();
        return res.status(response.status).json({ error: `Failed to read ${targetFile}`, details: errText });
      }
      const fileData = await response.json();
      const cleanBase64 = fileData.content.replace(/\n/g, '');
      const content = Buffer.from(cleanBase64, 'base64').toString('utf-8');
      return res.status(200).json(JSON.parse(content));
    }

    // POST: Append log to target file
    if (req.method === 'POST') {
      const { log } = req.body;

      const getFileRes = await fetch(url, { headers });
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
        return res.status(getFileRes.status).json({ error: `GitHub error fetching ${targetFile}`, details: errText });
      }

      if (!Array.isArray(logsList)) logsList = [];
      logsList.push(log);

      const updatedBase64 = Buffer.from(JSON.stringify(logsList, null, 2), 'utf-8').toString('base64');
      const putBody = {
        message: `Update ${targetFile}: Added new entry`,
        content: updatedBase64
      };
      if (fileSha) putBody.sha = fileSha;

      const updateRes = await fetch(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody)
      });

      if (updateRes.ok) {
        return res.status(200).json({ success: true, logs: logsList });
      } else {
        const errDetails = await updateRes.json();
        return res.status(updateRes.status).json({ error: `GitHub write failed to ${targetFile}`, details: JSON.stringify(errDetails) });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
