# Agentic Ninja QA - GitHub Action

AI-powered autonomous Playwright test generation, healing, and improvement for web apps.

## Usage

```yaml
- uses: AgenticSoftwareNinja/anqa-action@v1
  with:
    api_key: ${{ secrets.ANQA_API_KEY }}
    anthropic_key: ${{ secrets.ANTHROPIC_API_KEY }}
    mode: generate
    target_url: "https://your-app.com"
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Modes

| Mode | Description |
|------|-------------|
| `audit` | Crawl your app, discover user flows, identify test coverage gaps |
| `generate` | Generate Playwright tests for uncovered flows and open a PR |
| `pr-analysis` | Run affected tests on pull requests, auto-heal broken ones |
| `nightly` | Overnight: heal broken tests, generate new ones, open improvement PRs |

## Get started

1. Sign up at [dashboard](https://dashboard-theta-five-98.vercel.app)
2. Connect your GitHub repo
3. Add the workflow to your repo
4. Run an audit to discover flows

## License

Proprietary. All rights reserved.
