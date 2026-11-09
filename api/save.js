export default async function handler(req, res) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = process.env.REPO_OWNER;
  const REPO_NAME = process.env.REPO_NAME;

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/data.json`;

  try {
    if (req.method === 'GET') {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch data.json');
      const fileData = await response.json();
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      return res.status(200).json(JSON.parse(content));
    }

    if (req.method === 'POST') {
      const { type, log } = req.body;

      // 1. Fetch current data.json file & SHA key from GitHub
      const getFileRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      const fileData = await getFileRes.json();
      const currentData = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));

      // 2. Append new entry into corresponding list
      if (type === 'cooked') {
        currentData.cooked_logs.push(log);
      } else if (type === 'sold') {
        currentData.sold_logs.push(log);
      }

      // 3. Commit updated data.json back to GitHub
      const updatedBase64 = Buffer.from(JSON.stringify(currentData, null, 2)).toString('base64');
      const updateRes = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          message: `Update data.json: Added new ${type} entry`,
          content: updatedBase64,
          sha: fileData.sha
        })
      });

      if (updateRes.ok) {
        return res.status(200).json({ success: true, data: currentData });
      } else {
        const errDetails = await updateRes.json();
        return res.status(500).json({ error: 'GitHub write failed', details: errDetails });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
  
