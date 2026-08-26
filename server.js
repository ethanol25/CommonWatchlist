import express from 'express';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const userCache = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hour expiration

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/watchlist/:username', async (req, res) => {
  const { username } = req.params;
  const normalizedUsername = username.toLowerCase();
  
  console.log(`Received request for username: ${normalizedUsername}`);

  const cachedData = userCache.get(normalizedUsername);
  if (cachedData) {
    const isExpired = (Date.now() - cachedData.timestamp) > CACHE_TTL_MS;
    if (!isExpired) {
      console.log(`Returning stored data for ${normalizedUsername}`);
      return res.json({ success: true, items: cachedData.items, cached: true });
    } else {
      console.log(`Removing stale data for ${normalizedUsername}`);
      userCache.delete(normalizedUsername);
    }
  }

  console.log(`Scraping data for ${normalizedUsername}`);
  let itemNames = [];
  let i = 1;
  let browser = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const url = process.env.SCRAPED_URL;
    if (!url) {
      throw new Error('SCRAPED_URL is not defined in environment variables.');
    }

    while (true) {
      const targetUrl = `${url}/${normalizedUsername}/watchlist/page/${i}/`;
      console.log(`${normalizedUsername}: Navigating to: ${targetUrl}`);
      
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

      try {
        await page.waitForSelector('.griditem [data-item-name]', { timeout: 5000 });
      } catch (timeoutError) {
        console.log(`${normalizedUsername}: Exiting loop.`);
        break; 
      }

      const locator = page.locator('.griditem [data-item-name]');
      const count = await locator.count();
      console.log(`${normalizedUsername}: Found ${count} items on page ${i}`);

      const pageItems = await locator.evaluateAll(elements =>
        elements.map(el => el.getAttribute('data-item-name'))
      );

      itemNames = [...itemNames, ...pageItems];
      i++;
    }

    await browser.close();

    userCache.set(normalizedUsername, {
      items: itemNames,
      timestamp: Date.now()
    });
    console.log(`Stored ${itemNames.length} items for ${normalizedUsername}`);

    res.json({ success: true, items: itemNames, cached: false });

  } catch (error) {
    if (browser) await browser.close();
    console.error(`Failed scraping ${normalizedUsername}.`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch watchlist' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});