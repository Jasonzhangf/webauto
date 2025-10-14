# 1688 Containers

This module provides 1688 (Alibaba) platform containers following the event-driven, self-refreshing container pattern. Two adapters are provided for different site variants:

- domestic/ — Mainland China (1688.com) DOM and flows
- abroad/ — International (global variant) DOM and flows

Each adapter exposes a PageContainer and a LinkContainer. Implement site-specific selectors and operations per adapter.

