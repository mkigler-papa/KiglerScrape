require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const axios = require('axios');
const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const db = new Database('links.db');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT,
    summary TEXT,
    tags TEXT,
    thumbnail TEXT,
    domain TEXT,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET all links
app.get('/api/links', (req, res) => {
  const { sort = 'new' } = req.query;
  let orderBy = 'created_at DESC';
  if (sort === 'top') orderBy = '(upvotes - downvotes) DESC';
  if (sort === 'hot') orderBy = '(upvotes * 2 - downvotes + (unixepoch() - unixepoch(created_at)) / -3600) DESC';

  let links = db.prepare(`SELECT * FROM links ORDER BY ${orderBy}`).all();
  links = links.map(link => ({ ...link, tags: link.tags ? JSON.parse(link.tags) : [] }));
  res.json(links);
});

// GET all unique tags
app.get('/api/tags', (req, res) => {
  const links = db.prepare('SELECT tags FROM links').all();
  const tagSet = new Set();
  links.forEach(link => {
    if (link.tags) JSON.parse(link.tags).forEach(t => tagSet.add(t));
  });
  res.json([...tagSet].sort());
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
          content: `Analyze this webpage and respond ONLY with valid JSON (no extra text).\n\nURL: ${normalUrl}\nPage title: ${ogTitle || metaTitle}\nMeta description: ${ogDesc || metaDesc}\nContent preview: ${bodyText}\n\nRespond with this exact JSON structure:\n{\n  "title": "concise descriptive title (max 120 chars)",\n  "summary": "2-3 sentence summary of what this page is about and why it might be interesting",\n  "tags": ["tag1", "tag2", "tag3"]\n}\n\nRules for tags: 3-6 lowercase tags, single words or short hyphenated phrases, descriptive of content/topic.`
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

    const result = db.prepare(
      'INSERT INTO links (url, title, summary, tags, thumbnail, domain) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(normalUrl, aiTitle, aiSummary, JSON.stringify(aiTags), ogImage, domain);

    const link = db.prepare('SELECT * FROM links WHERE id = ?').get(result.lastInsertRowid);
    link.tags = JSON.parse(link.tags || '[]');
    res.json(link);
  } catch (error) {
    console.error('Error adding link:', error.message);
    res.status(500).json({ error: 'Failed to process URL: ' + error.message });
  }
});

// PUT vote
app.put('/api/links/:id/vote', (req, res) => {
  const { id } = req.params;
  const { type } = req.body;
  if (type === 'up')   db.prepare('UPDATE links SET upvotes   = upvotes   + 1 WHERE id = ?').run(id);
  if (type === 'down') db.prepare('UPDATE links SET downvotes = downvotes + 1 WHERE id = ?').run(id);
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(id);
  link.tags = JSON.parse(link.tags || '[]');
  res.json(link);
});

// DELETE link
app.delete('/api/links/:id', (req, res) => {
  db.prepare('DELETE FROM links WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n🚀 KiglerScrape running at http://localhost:${PORT}\n`));
