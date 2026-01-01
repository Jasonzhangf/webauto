#!/bin/bash
# Run all tests

echo "🧪 Running all WebAuto tests..."

# Run unit tests
echo ""
echo "📦 Phase 1: Unit Tests"
echo "────────────────────────────────────────"
node tests/runner/TestRunner.mjs --suite=unit
UNIT_EXIT=$?

if [ $UNIT_EXIT -ne 0 ]; then
  echo ""
  echo "⚠️  Unit tests failed, stopping test suite"
  exit 1
fi

# Run integration tests
echo ""
echo "🔗 Phase 2: Integration Tests"
echo "────────────────────────────────────────"
node tests/runner/TestRunner.mjs --suite=integration
INTEGRATION_EXIT=$?

# Run E2E tests (even if integration fails)
echo ""
echo "🎯 Phase 3: E2E Tests"
echo "────────────────────────────────────────"
node tests/runner/TestRunner.mjs --suite=e2e
E2E_EXIT=$?

# Summary
echo ""
echo "════════════════════════════════════════"
echo "📊 Test Suite Summary"
echo "════════════════════════════════════════"
echo "Unit Tests:        $([ $UNIT_EXIT -eq 0 ] && echo '✅ Passed' || echo '❌ Failed')"
echo "Integration Tests: $([ $INTEGRATION_EXIT -eq 0 ] && echo '✅ Passed' || echo '❌ Failed')"
echo "E2E Tests:         $([ $E2E_EXIT -eq 0 ] && echo '✅ Passed' || echo '❌ Failed')"
echo "════════════════════════════════════════"

# Exit with failure if any test suite failed
if [ $UNIT_EXIT -ne 0 ] || [ $INTEGRATION_EXIT -ne 0 ] || [ $E2E_EXIT -ne 0 ]; then
  exit 1
fi

echo ""
echo "✅ All test suites passed!"
exit 0
