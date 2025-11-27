# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a demo system (LLM Ops Demo) that automatically analyzes CloudWatch errors using Claude Code and creates GitHub Issues. The system detects errors from a sample API Gateway + Lambda application, triggers GitHub Actions, and uses Claude Code to analyze the errors.

## Build and Deploy Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run deploy         # Build and deploy all Lambda functions + API Gateway
npm run deploy:sample-app   # Deploy only the sample app Lambda
npm run deploy:trigger      # Deploy only the trigger Lambda
npm run clean          # Remove dist/ directory
```

## Architecture

The system consists of three main components:

1. **Sample App Lambda** (`src/lambda/sample-app/index.ts`)
   - Blog API with intentional bugs for demonstrating error analysis
   - Routes: GET/POST `/articles`, GET/PUT `/articles/:id`, POST `/articles/:id/comments`
   - Logs errors in structured JSON format to CloudWatch

2. **Trigger Workflow Lambda** (`src/lambda/trigger-workflow/index.ts`)
   - Receives CloudWatch Logs via subscription filter
   - Decodes and decompresses log data
   - Triggers GitHub Actions via `repository_dispatch` event with error details

3. **GitHub Actions Workflow** (`.github/workflows/error-analysis.yml`)
   - Triggered by `repository_dispatch` with `error-detected` event type
   - Creates GitHub Issue with error details and requests Claude Code analysis

## Key Integration Points

- CloudWatch Logs subscription filter monitors `/aws/lambda/llm-ops-sample-app` for `$.severity = "ERROR"`
- GitHub API (Octokit) dispatches events with `event_type: 'error-detected'`
- Environment variables: `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` are required for the trigger Lambda

## TypeScript Configuration

- Target: ES2022
- Module: CommonJS
- Strict mode enabled
- Source files in `src/`, compiled output in `dist/`
