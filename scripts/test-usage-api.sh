#!/bin/bash
# 测试 usage API
curl -s http://127.0.0.1:7701/v1/usage?action=browser:highlight | grep "success" && echo "✅ browser:highlight usage found" || echo "❌ browser:highlight usage failed"
curl -s http://127.0.0.1:7701/v1/usage | grep "browser:highlight" && echo "✅ all usages list works" || echo "❌ all usages list failed"
