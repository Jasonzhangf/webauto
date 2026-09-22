// Weibo browser boundary. Wraps the shared v3 Camo adapter and provides the
// two data reads Weibo needs: anchor projection and same-origin JSON fetches.

import { CamoAdapter } from '../../../modules/webauto-v3/src/camo-adapter.mjs';

const MOBILE_DETAIL_ANCHORS = Object.freeze({
  'post.root': '.card9',
  'post.text': '.weibo-text',
  'post.media': '.weibo-media',
  'comment.list': '.comment-content',
  'comment.item': '.comment-content > div',
});

const DESKTOP_SEARCH_ANCHORS = Object.freeze({
  'search.input': 'input.woo-input-main',
  'search.submit': 'button.s-btn-b',
  'result.list': '.card-wrap',
  'result.post': ".card-wrap a[href*='weibo.com/']",
  'pager.next': "a[href*='page=']:last-of-type",
});

const DESKTOP_PROFILE_ANCHORS = Object.freeze({
  'profile.root': '.wbpro-scroller-item',
  'profile.post': ".wbpro-scroller-item a[title]",
});

const MOBILE_PROFILE_ANCHORS = Object.freeze({
  'profile.root': '.card9',
  'profile.post': '.card9 .weibo-main',
});

export const WEIBO_ANCHORS = Object.freeze({
  mobileDetail: MOBILE_DETAIL_ANCHORS,
  desktopSearch: DESKTOP_SEARCH_ANCHORS,
  desktopProfile: DESKTOP_PROFILE_ANCHORS,
  mobileProfile: MOBILE_PROFILE_ANCHORS,
});

function anchorProjectionScript(selectors) {
  return `(() => {
    const selectors = ${JSON.stringify(selectors)};
    const out = {};
    for (const [name, selector] of Object.entries(selectors)) {
      let nodes = [];
      try { nodes = Array.from(document.querySelectorAll(selector)); } catch (_) { nodes = []; }
      const visible = nodes.some((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
          && rect.top < window.innerHeight && rect.left < window.innerWidth
          && style.display !== 'none' && style.visibility !== 'hidden';
      });
      out[name] = { selector, count: nodes.length, visible };
    }
    return out;
  })()`;
}

function pageInfoScript() {
  return `(() => ({
    url: location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scroll: { x: window.scrollX, y: window.scrollY },
    textDigest: String(document.body?.innerText || '').slice(0, 4096),
  }))()`;
}

export class WeiboBrowser {
  constructor({ adapter = new CamoAdapter(), profileId, target = null } = {}) {
    if (!profileId) throw new Error('WeiboBrowser requires profileId');
    this.adapter = adapter;
    this.profileId = profileId;
    if (target) this.adapter.setTarget(profileId, target);
  }

  async ensureStarted({ url, headless = false, width, height } = {}) {
    const started = await this.adapter.start({
      profileId: this.profileId,
      url,
      headless,
      width,
      height,
    });
    if (!started.target) {
      throw new Error('camo start did not return a stable target');
    }
    return started;
  }

  async setViewport(width, height) {
    return this.adapter.setViewport({ profileId: this.profileId, width, height });
  }

  async goto(url, waitUntil = 'domcontentloaded') {
    return this.adapter.goto({ profileId: this.profileId, url, waitUntil });
  }

  async pageInfo() {
    return this.adapter.evaluate({
      profileId: this.profileId,
      script: pageInfoScript(),
    });
  }

  async observeAnchors(selectors) {
    const result = await this.adapter.evaluate({
      profileId: this.profileId,
      script: anchorProjectionScript(selectors),
    });
    if (!result || typeof result !== 'object') {
      throw new Error('anchor projection returned a non-object');
    }
    return result;
  }

  async evaluate(script, { retries = 3 } = {}) {
    const wrapped = `Promise.resolve(${script}).then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error: String(error) })
    )`;
    let last = null;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await this.adapter.evaluate({
          profileId: this.profileId,
          script: wrapped,
        });
        if (result && typeof result === 'object' && result.ok) return result.value;
        last = result?.error || result;
      } catch (error) {
        last = error?.message || String(error);
      }
    }
    throw new Error(`weibo page evaluate failed: ${last}`);
  }

  // IME-safe text entry. `type` stays for shortcut keys only.
  async fillInput(selector, value) {
    return this.adapter.fillInput({
      profileId: this.profileId,
      selector,
      value,
    });
  }

  async click(selector) {
    return this.adapter.click({
      profileId: this.profileId,
      selector,
    });
  }

  async pressKey(key) {
    return this.adapter.pressKey({
      profileId: this.profileId,
      key,
    });
  }

  async fetchJson(url, { headers = {} } = {}) {
    const script = `fetch(${JSON.stringify(url)}, ${JSON.stringify({
      credentials: 'include',
      headers,
    })}).then((response) => response.json())`;
    return this.evaluate(script);
  }

  async scroll(dy, { atX, atY } = {}) {
    return this.adapter.scroll({
      profileId: this.profileId,
      dx: 0,
      dy,
      atX,
      atY,
    });
  }
}
