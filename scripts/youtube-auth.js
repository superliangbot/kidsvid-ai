#!/usr/bin/env node
/**
 * YouTube OAuth2 Authorization Flow
 * Run this once to get a refresh token, then add it to .env
 */

import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in .env');
  process.exit(1);
}

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>❌ Auth failed</h1><p>${error}</p>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end('No code received');
    return;
  }

  // Exchange code for tokens
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h1>❌ Token exchange failed</h1><pre>${JSON.stringify(tokens, null, 2)}</pre>`);
      server.close();
      process.exit(1);
    }

    console.log('\n✅ Authorization successful!\n');
    console.log('Add this to your .env file:\n');
    console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`\nAccess token (expires): ${tokens.access_token?.slice(0, 30)}...`);
    console.log(`Token type: ${tokens.token_type}`);
    console.log(`Expires in: ${tokens.expires_in}s`);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html><body style="font-family:system-ui;max-width:600px;margin:40px auto;padding:20px">
        <h1>✅ YouTube Auth Complete!</h1>
        <p>Refresh token has been printed to the terminal.</p>
        <p>You can close this tab.</p>
      </body></html>
    `);

    server.close();
    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    res.writeHead(500);
    res.end(`Error: ${err.message}`);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\n🎬 YouTube OAuth2 Authorization\n`);
  console.log(`Listening on http://localhost:${PORT}/callback`);
  console.log(`\nOpen this URL in your browser:\n`);
  console.log(authUrl);
  console.log(`\nWaiting for authorization...`);
});
