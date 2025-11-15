import { WeiboLinkExtractor } from "./WeiboLinkExtractor";
import { WeiboInfiniteScrollDetector } from "./WeiboInfiniteScrollDetector";
import { WeiboAntiBotProtection } from "./WeiboAntiBotProtection";
import { WeiboPostAnalyzer } from "./WeiboPostAnalyzer";
import { WeiboBatchAnalyzer } from "./WeiboBatchAnalyzer";

async function testStandaloneComponents() {
  console.log("=== Standalone Component Test ===");
  const results = [];
  
  const components = [
    { name: "WeiboLinkExtractor", create: () => new WeiboLinkExtractor() },
    { name: "WeiboInfiniteScrollDetector", create: () => new WeiboInfiniteScrollDetector() },
    { name: "WeiboAntiBotProtection", create: () => new WeiboAntiBotProtection() },
    { name: "WeiboPostAnalyzer", create: () => new WeiboPostAnalyzer() },
    { name: "WeiboBatchAnalyzer", create: () => new WeiboBatchAnalyzer({
      homepage: { url: "https://weibo.com", maxPosts: 5, scrollCount: 1 },
      posts: { includeMedia: false, includeComments: false, maxCommentDepth: 1, maxComments: 5, downloadMedia: false },
      concurrency: { maxConcurrent: 1, delayBetween: 1000 },
      output: { directory: "./test-results", format: "json", saveProgress: false }
    })}
  ];
  
  for (const component of components) {
    try {
      const instance = component.create();
      console.log(`${component.name}: OK`);
      results.push({ name: component.name, status: "OK" });
    } catch (error) {
      console.log(`${component.name}: FAILED - ${error.message}`);
      results.push({ name: component.name, status: "FAILED", error: error.message });
    }
  }
  
  const passed = results.filter(r => r.status === "OK").length;
  const failed = results.filter(r => r.status === "FAILED").length;
  
  console.log(`\nResults: ${passed}/${results.length} components initialized successfully`);
  
  if (failed > 0) {
    console.log("\nFailed components:");
    results.filter(r => r.status === "FAILED").forEach(r => {
      console.log(`  ${r.name}: ${r.error}`);
    });
  }
  
  return { total: results.length, passed, failed };
}

if (require.main === module) {
  testStandaloneComponents().then(result => {
    if (result.failed === 0) {
      console.log("\nAll standalone components ready!");
    } else {
      console.log("\nSome components failed initialization.");
      process.exit(1);
    }
  });
}
