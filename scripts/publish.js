import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  try {
    const out = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n\n',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).toString()
    const token = out.split('\n').find((l) => l.startsWith('password='))?.replace('password=', '').trim()
    if (token) return token
  } catch (err) {
    // fallback
  }
  return null
}

function runCurl(args) {
  const res = execSync(`curl.exe ${args}`, {
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 50 * 1024 * 1024,
  }).toString()
  return res
}

async function main() {
  const token = getGitHubToken()
  if (!token) {
    console.error('❌ Не удалось получить токен GitHub из Git Credential Manager.')
    process.exit(1)
  }

  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  const version = pkg.version
  const tagName = `v${version}`
  const owner = 'artiks99'
  const repo = 'revizor'

  const nsisDir = path.resolve('src-tauri/target/release/bundle/nsis')
  const localExeName = `Ревизор_${version}_x64-setup.exe`
  const localExePath = path.join(nsisDir, localExeName)
  const sigPath = path.join(nsisDir, `${localExeName}.sig`)
  const latestJsonPath = path.join(nsisDir, 'latest.json')
  const uploadExeName = `revizor_${version}_x64-setup.exe`

  if (!fs.existsSync(localExePath) || !fs.existsSync(sigPath)) {
    console.error(`❌ Не найдены файлы релиза в ${nsisDir}. Сначала выполните сборку: npm run build:release`)
    process.exit(1)
  }

  // 1. Формируем актуальный latest.json с ASCII ссылкой
  const signature = fs.readFileSync(sigPath, 'utf8').trim()
  const latestJson = {
    version: version,
    notes: `Обновление приложения Ревизор до версии v${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature: signature,
        url: `https://github.com/${owner}/${repo}/releases/download/v${version}/${uploadExeName}`,
      },
    },
  }
  fs.writeFileSync(latestJsonPath, JSON.stringify(latestJson, null, 2), 'utf8')

  console.log(`\n🚀 Публикация релиза ${tagName} в GitHub...`)

  // 2. Получаем или создаем релиз
  let release = null
  try {
    const raw = runCurl(`-s -H "Authorization: Bearer ${token}" -H "User-Agent: revizor-publisher" https://api.github.com/repos/${owner}/${repo}/releases/tags/${tagName}`)
    const parsed = JSON.parse(raw)
    if (parsed.id) {
      release = parsed
      console.log(`ℹ️ Релиз ${tagName} найден на GitHub (ID: ${release.id})`)
    }
  } catch (e) {
    // не существует
  }

  if (!release) {
    console.log(`📦 Создание релиза ${tagName}...`)
    const payload = JSON.stringify({
      tag_name: tagName,
      name: `Ревизор ${tagName}`,
      body: `Релиз ${tagName}. Оптимизация окна «Добавление» на мобильном терминале: компактный интерфейс без скролла, отключение авто-фокуса клавиатуры при сканировании.`,
      draft: false,
      prerelease: false,
    })
    const tmpPayloadPath = path.join(nsisDir, 'release_payload.json')
    fs.writeFileSync(tmpPayloadPath, payload, 'utf8')
    const raw = runCurl(`-s -X POST -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -H "User-Agent: revizor-publisher" --data-binary "@${tmpPayloadPath}" https://api.github.com/repos/${owner}/${repo}/releases`)
    try { fs.unlinkSync(tmpPayloadPath) } catch {}
    release = JSON.parse(raw)
    if (!release.id) {
      console.error('❌ Ошибка создания релиза:', raw)
      process.exit(1)
    }
    console.log(`✅ Релиз ${tagName} создан (ID: ${release.id})`)
  }

  // 3. Удаляем старые ассеты с тем же именем, если есть
  if (release.assets && release.assets.length > 0) {
    for (const asset of release.assets) {
      if (asset.name === 'latest.json' || asset.name === uploadExeName || asset.name === '_1.0.5_x64-setup.exe' || asset.name === localExeName) {
        console.log(`🔄 Удаление старого ассета ${asset.name}...`)
        try {
          runCurl(`-s -X DELETE -H "Authorization: Bearer ${token}" -H "User-Agent: revizor-publisher" https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`)
        } catch (e) {}
      }
    }
  }

  // 4. Загружаем latest.json
  console.log(`📤 Загрузка latest.json...`)
  runCurl(`-s -X POST -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -H "User-Agent: revizor-publisher" --data-binary "@${latestJsonPath}" "https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=latest.json"`)
  console.log(`✅ latest.json загружен!`)

  // 5. Загружаем инсталлятор
  console.log(`📤 Загрузка ${uploadExeName} (это может занять 5-15 секунд)...`)
  runCurl(`-s -X POST -H "Authorization: Bearer ${token}" -H "Content-Type: application/octet-stream" -H "User-Agent: revizor-publisher" --data-binary "@${localExePath}" "https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${uploadExeName}"`)
  console.log(`✅ ${uploadExeName} успешно загружен!`)

  console.log(`\n==================================================`)
  console.log(`🎉 Релиз ${tagName} полностью опубликован и готов к обновлению!`)
  console.log(`👉 https://github.com/${owner}/${repo}/releases/tag/${tagName}`)
  console.log(`==================================================\n`)

  // 6. Деплой серверной части на VDS (опционально)
  // При наличии на сервере /opt/revizor/deploy.sh выполняет автообновление
  const vdsHost = process.env.VDS_HOST || '114.29.238.81'
  if (vdsHost) {
    const vdsUser = process.env.VDS_USER || 'deploy'
    const vdsPort = process.env.VDS_PORT || '22'
    const vdsPath = process.env.VDS_PATH || '/opt/revizor'

    console.log(`\n☁️  Проверка деплоя на VDS (${vdsUser}@${vdsHost}:${vdsPort})...`)
    try {
      const sshCmd = [
        `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new`,
        `-p ${vdsPort} ${vdsUser}@${vdsHost}`,
        `"[ -f ${vdsPath}/deploy.sh ] && (cd ${vdsPath} && git pull origin main && ./deploy.sh) || echo 'ℹ️ deploy.sh еще не развернут на VDS (будет настроен на этапе 2).'"`
      ].join(' ')
      execSync(sshCmd, { stdio: 'inherit', timeout: 120_000 })
    } catch (err) {
      console.warn(`⚠️  Не удалось обновить VDS: ${err.message}`)
    }
  }
}

main().catch((err) => {
  console.error('❌ Ошибка:', err)
  process.exit(1)
})
