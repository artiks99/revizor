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
  const exeName = `Ревизор_${version}_x64-setup.exe`
  const exePath = path.join(nsisDir, exeName)
  const latestJsonPath = path.join(nsisDir, 'latest.json')

  if (!fs.existsSync(exePath) || !fs.existsSync(latestJsonPath)) {
    console.error(`❌ Не найдены файлы релиза в ${nsisDir}. Сначала выполните сборку: npm run build:release`)
    process.exit(1)
  }

  console.log(`\n🚀 Автоматическая публикация релиза ${tagName} в GitHub...`)

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'revizor-publisher',
  }

  // 1. Проверяем или создаем релиз
  let release = null
  const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tagName}`, { headers })
  if (checkRes.ok) {
    release = await checkRes.json()
    console.log(`ℹ️ Релиз ${tagName} уже существует (ID: ${release.id}). Будут обновлены файлы.`)
  } else {
    console.log(`📦 Создание нового релиза ${tagName}...`)
    const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tag_name: tagName,
        name: `Ревизор ${tagName}`,
        body: `Автоматический релиз версии ${tagName}. Адаптация таблиц для 14-дюймовых ноутбуков и компактный интерфейс.`,
        draft: false,
        prerelease: false,
      }),
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      console.error(`❌ Ошибка создания релиза: ${createRes.status} ${errText}`)
      process.exit(1)
    }
    release = await createRes.json()
    console.log(`✅ Релиз успешно создан (ID: ${release.id})`)
  }

  // 2. Функция загрузки ассета
  async function uploadAsset(fileName, filePath, contentType) {
    // Если файл уже есть в релизе — удаляем его перед перезаписью
    const existing = release.assets?.find((a) => a.name === fileName)
    if (existing) {
      console.log(`🔄 Удаление старой версии файла ${fileName}...`)
      await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${existing.id}`, {
        method: 'DELETE',
        headers,
      })
    }

    console.log(`📤 Загрузка ${fileName}...`)
    const fileBuffer = fs.readFileSync(filePath)
    const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
      },
      body: fileBuffer,
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      throw new Error(`Ошибка загрузки ${fileName}: ${uploadRes.status} ${err}`)
    }

    console.log(`✅ ${fileName} успешно загружен!`)
  }

  // 3. Загружаем файлы
  await uploadAsset('latest.json', latestJsonPath, 'application/json')
  await uploadAsset(exeName, exePath, 'application/octet-stream')

  console.log(`\n==================================================`)
  console.log(`🎉 Релиз ${tagName} успешно опубликован на GitHub!`)
  console.log(`👉 https://github.com/${owner}/${repo}/releases/tag/${tagName}`)
  console.log(`==================================================\n`)
}

main().catch((err) => {
  console.error('❌ Ошибка публикации:', err)
  process.exit(1)
})
