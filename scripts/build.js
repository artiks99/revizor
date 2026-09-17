import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const keyPath = path.resolve('src-tauri/revizor.key')
if (fs.existsSync(keyPath)) {
  process.env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(keyPath, 'utf8').trim()
  if (process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
  }
}

const result = spawnSync('npx', ['tauri', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

if (result.status === 0) {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    const version = pkg.version
    const nsisDir = path.resolve('src-tauri/target/release/bundle/nsis')
    const exeName = `Ревизор_${version}_x64-setup.exe`
    const sigName = `${exeName}.sig`
    const sigPath = path.join(nsisDir, sigName)
    const exePath = path.join(nsisDir, exeName)

    if (fs.existsSync(sigPath) && fs.existsSync(exePath)) {
      const signature = fs.readFileSync(sigPath, 'utf8').trim()
      const latestJson = {
        version: version,
        notes: `Обновление приложения Ревизор до версии v${version}`,
        pub_date: new Date().toISOString(),
        platforms: {
          'windows-x86_64': {
            signature: signature,
            url: `https://github.com/artiks99/revizor/releases/download/v${version}/${encodeURIComponent(exeName)}`
          }
        }
      }
      const latestJsonPath = path.join(nsisDir, 'latest.json')
      fs.writeFileSync(latestJsonPath, JSON.stringify(latestJson, null, 2), 'utf8')
      console.log(`\n==================================================`)
      console.log(`✅ Файл latest.json успешно сформирован:`)
      console.log(`   ${latestJsonPath}`)
      console.log(`==================================================\n`)

      // Автоматическая публикация на GitHub
      const publishScript = path.resolve('scripts/publish.js')
      if (fs.existsSync(publishScript)) {
        spawnSync('node', ['--dns-result-order=ipv4first', publishScript], {
          stdio: 'inherit',
          shell: true,
          env: process.env,
        })
      }
    }
  } catch (err) {
    console.error('Ошибка создания latest.json или публикации:', err)
  }
}

process.exit(result.status ?? 0)
