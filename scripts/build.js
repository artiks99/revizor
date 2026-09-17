import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const keyPath = path.resolve('src-tauri/revizor.key')
if (fs.existsSync(keyPath)) {
  process.env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(keyPath, 'utf8').trim()
}

const result = spawnSync('npx', ['tauri', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

process.exit(result.status ?? 0)
