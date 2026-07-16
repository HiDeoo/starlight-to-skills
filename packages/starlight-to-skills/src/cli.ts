#!/usr/bin/env node

import process from 'node:process'

import { runCli } from './libs/cli'

process.exitCode = runCli(process.argv.slice(2))
