require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DATA_FILE = path.join(__dirname, 'links.json');

// Simple JSON file database
function readDB() {
  if (!fs.existsSync(DATA_FILE)) return { links: [], nextId: 1 };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return { links: [], nextId: 1 }; }
}
function writeDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET all links
app.get('/api/links', (req, res) => {
  const { sort = 'new' } = req.query;
  const db = readDB();
  let links = [...db.links];

  if (sort === 'new') links.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (sort === 'top') links.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
  if (sort === 'hot') {
    const now = Date.now();
    links.sort((a, b) => {
      const scoreA = (a.upvotes * 2 - a.downvotes) - (now - new Date(a.created_at)) / 3600000;
      const scoreB = (b.upvotes * 2 - b.downvotes) - (now - new Date(b.created_at)) / 3600000;
      return scoreB - scoreA;
    });
  }
  res.json(links);
});

// POST add a new link
app.post('/api/links', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  let normalUrl = url.trim();
  if (!/^https?:\/\//i.test(normalUrl)) normalUrl = 'https://' + normalUrl;

  try {
    const domain = new URL(normalUrl).hostname.replace('www.', '');

    const response = await axios.get(normalUrl, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);
    const ogTitle   = $('meta[property="og:title"]').attr('content') || '';
    const metaTitle = $('title').text().trim() || '';
    const ogDesc    = $('meta[property="og:description"]').attr('content') || '';
    const metaDesc  = $('meta[name="description"]').attr('content') || '';
    const ogImage   = $('meta[property="og:image"]').attr('content') || '';
    const bodyText  = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 4000);

    let aiTitle   = ogTitle || metaTitle || normalUrl;
    let aiSummary = ogDesc || metaDesc || '';
    let aiTags    = [];

    if (process.env.ANTHROPIC_API_KEY) {
      const aiResponse = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `Analyze this webpage and respond ONLY with valid JSON (no extra text).

URL: ${normalUrl}
Page title: ${ogTitle || metaTitle}
Meta description: ${ogDesc || metaDesc}
Content preview: ${bodyText}

Respond with this exact JSON structure:
{
  "title": "concise descriptive title (max 120 chars)",
  "summary": "2-3 sentence summary of what this page is about and why it might be interesting",
  "tags": ["tag1", "tag2", "tag3"]
}

Rules for tags: 3-6 lowercase tags, single words or short hyphenated phrases, descriptive of content/topic.`
        }]
      });

      try {
        const parsed = JSON.parse(aiResponse.content[0].text.trim());
        aiTitle   = parsed.title   || aiTitle;
        aiSummary = parsed.summary || aiSummary;
        aiTags    = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6) : [];
      } catch (e) {
        console.warn('AI JSON parse failed, using meta fallback');
      }
    }

    const db = readDB();
    const link = {
      id: db.nextId++,
      url: normalUrl,
      title: aiTitle,
      summary: aiSummary,
      tags: aiTags,
      thumbnail: ogImage,
      domain,
      upvotes: 0,
      downvotes: 0,
      created_at: new Date().toISOString()
    };
    db.links.push(link);
    writeDB(db);
    res.json(link);
  } catch (error) {
    console.error('Error adding link:', error.message);
    res.status(500).json({ error: 'Failed to process URL: ' + error.message });
  }
});

// PUT vote
app.put('/api/links/:id/vote', (req, res) => {
  const id = parseInt(req.params.id);
  const { type } = req.body;
  const db = readDB();
  const link = db.links.find(l => l.id === id);
  if (!link) return res.status(404).json({ error: 'Not found' });
  if (type === 'up')   link.upvotes++;
  if (type === 'down') link.downvotes++;
  writeDB(db);
  res.json(link);
});

// DELETE link
app.delete('/api/links/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const db = readDB();
  db.links = db.links.filter(l => l.id !== id);
  writeDB(db);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n🚀 KiglerScrape running at http://localhost:${PORT}\n`));
