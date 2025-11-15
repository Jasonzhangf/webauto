import { WeiboBatchAnalyzer } from "./WeiboBatchAnalyzer";
import { WeiboHomepageStrategy } from "./WeiboHomepageStrategy";

async function testBasicInit() {
  console.log("Basic Component Test");
  
  try {
    const strategy = new WeiboHomepageStrategy();
    console.log("WeiboHomepageStrategy: OK");
  } catch (e) {
    console.log("WeiboHomepageStrategy: FAILED -", e.message);
  }
  
  try {
    const analyzer = new WeiboBatchAnalyzer({
      homepage: { url: "https://weibo.com", maxPosts: 5, scrollCount: 1 },
      posts: { includeMedia: false, includeComments: false, maxCommentDepth: 1, maxComments: 5, downloadMedia: false },
      concurrency: { maxConcurrent: 1, delayBetween: 1000 },
      output: { directory: "./test-results", format: "json", saveProgress: false }
    });
    console.log("WeiboBatchAnalyzer: OK");
  } catch (e) {
    console.log("WeiboBatchAnalyzer: FAILED -", e.message);
  }
}

if (require.main === module) {
  testBasicInit();
}
