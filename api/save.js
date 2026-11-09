export default async function handler(req, res) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME = process.env.REPO_NAME;

  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME) {
    return res.status(500).json({ 
      error: 'Vercel Environment Variables Missing',
      details: 'Please set GITHUB_TOKEN, REPO_OWNER, and REPO_NAME in Vercel Settings.'
    });
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/data.json`;
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'sopno-fast-food-app'
  };

  try {
    if (req.method === 'GET') {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: 'GitHub read failed', details: errText });
      }
      const fileData = await response.json();
      const cleanBase64 = fileData.content.replace(/\n/g, '');
      const content = Buffer.from(cleanBase64, 'base64').toString('utf-8');
      return res.status(200).json(JSON.parse(content));
    }

    if (req.method === 'POST') {
      const { type, log } = req.body;

      const getFileRes = await fetch(url, { headers });
      if (!getFileRes.ok) {
        const errText = await getFileRes.text();
        return res.status(getFileRes.status).json({ error: 'GitHub read failed', details: errText });
      }

      const fileData = await getFileRes.json();
      const fileSha = fileData.sha;
      const cleanBase64 = fileData.content.replace(/\n/g, '');
      let currentData = JSON.parse(Buffer.from(cleanBase64, 'base64').toString('utf-8'));

      if (!currentData.cooked_logs) currentData.cooked_logs = [];
      if (!currentData.sold_logs) currentData.sold_logs = [];

      // Append log entry
      if (type === 'cooked') {
        currentData.cooked_logs.push(log);
      } else if (type === 'sold') {
        currentData.sold_logs.push(log);
      }

      const updatedBase64 = Buffer.from(JSON.stringify(currentData, null, 2), 'utf-8').toString('base64');
      
      const updateRes = await fetch(url, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update data.json: Added new ${type} entry`,
          content: updatedBase64,
          sha: fileSha
        })
      });

      if (updateRes.ok) {
        return res.status(200).json({ success: true, data: currentData });
      } else {
        const errDetails = await updateRes.json();
        return res.status(updateRes.status).json({ error: 'GitHub write failed', details: JSON.stringify(errDetails) });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
