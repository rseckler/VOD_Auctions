const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const files = [
    '1a-brutalist-home',
    '1b-brutalist-block',
    '2a-luxury-home',
    '2b-luxury-block',
    '3a-vinyl-home',
    '3b-vinyl-block',
    '4a-marketplace-home',
    '4b-marketplace-block',
    '5a-neon-home',
    '5b-neon-block',
  ];

  for (const file of files) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    const htmlPath = path.resolve(__dirname, `${file}.html`);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

    // Wait for fonts to load
    await page.waitForTimeout(2000);

    // Take full page screenshot
    await page.screenshot({
      path: path.resolve(__dirname, `${file}.jpg`),
      type: 'jpeg',
      quality: 90,
      fullPage: true,
    });
    console.log(`✓ ${file}.jpg`);
    await page.close();
  }

  await browser.close();
  console.log('\nDone! All 10 screenshots generated.');
})();
