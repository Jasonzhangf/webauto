const fs = require('fs').promises;
const path = require('path');

class CookieManager {
  constructor(cookieFilePath = './cookies.json') {
    this.cookieFilePath = cookieFilePath;
  }

  async saveCookies(url, cookies) {
    try {
      // Read existing cookies
      let allCookies = {};
      try {
        const data = await fs.readFile(this.cookieFilePath, 'utf8');
        allCookies = JSON.parse(data);
      } catch (err) {
        // File doesn't exist or is invalid, start fresh
      }

      // Save cookies for this URL
      allCookies[url] = cookies;

      // Write back to file
      await fs.writeFile(this.cookieFilePath, JSON.stringify(allCookies, null, 2));
      console.log(`Cookies saved for ${url}`);
    } catch (error) {
      console.error(`Error saving cookies: ${error.message}`);
    }
  }

  async loadCookies(url) {
    try {
      const data = await fs.readFile(this.cookieFilePath, 'utf8');
      const allCookies = JSON.parse(data);
      return allCookies[url] || [];
    } catch (err) {
      // File doesn't exist or is invalid
      return [];
    }
  }
}

module.exports = CookieManager;