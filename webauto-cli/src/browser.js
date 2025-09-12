const camoufox = require('camoufox');

class Browser {
  constructor() {
    this.instance = null;
  }

  async launch() {
    if (!this.instance) {
      this.instance = await camoufox.launch({
        headless: true,
        // Add other launch options as needed
      });
    }
    return this.instance;
  }

  async close() {
    if (this.instance) {
      await this.instance.close();
      this.instance = null;
    }
  }
}

module.exports = Browser;