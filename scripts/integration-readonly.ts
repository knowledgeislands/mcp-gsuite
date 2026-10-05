#!/usr/bin/env bun
import { runReadOnlyIntegration } from '../src/main/integration-readonly/index.js'

const outcome = await runReadOnlyIntegration(process.env)
console.log(JSON.stringify(outcome))
process.exitCode = outcome.ok ? 0 : 1
