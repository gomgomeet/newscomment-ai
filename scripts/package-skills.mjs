#!/usr/bin/env node
// 연수 배포용 스킬 ZIP 패키징
//
//   node scripts/package-skills.mjs            # skills/ 아래 전부
//   node scripts/package-skills.mjs edu-rubric # 특정 스킬만
//
// claude.ai 업로드 규격에 맞는 ZIP을 dist/skills/ 에 만든다.
//   - ZIP 안에 스킬 이름 폴더 하나, 그 안에 SKILL.md
//   - frontmatter 는 스펙 허용 키만 (name/description/license/compatibility/metadata/allowed-tools)
//   - name: 64자 이하, 소문자·숫자·하이픈, 예약어(anthropic/claude) 금지
//   - description: 1~1024자
//   - 압축 해제 크기 30MB 미만

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SKILLS_DIR = path.join(ROOT, 'skills')
const OUT_DIR = path.join(ROOT, 'dist', 'skills')

const ALLOWED_KEYS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
])
const RESERVED = ['anthropic', 'claude']
const MAX_UNCOMPRESSED = 30 * 1024 * 1024

/** SKILL.md frontmatter 에서 최상위 키와 name/description 값만 뽑는다. */
function readFrontmatter(file) {
  const text = fs.readFileSync(file, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)
  if (!match) throw new Error('SKILL.md 맨 위에 --- 로 감싼 frontmatter 가 없습니다')

  const keys = []
  const values = {}
  let current = null
  for (const line of match[1].split(/\r?\n/)) {
    const top = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (top) {
      current = top[1]
      keys.push(current)
      values[current] = top[2].replace(/^[>|][-+]?\s*$/, '').trim()
    } else if (current && line.trim()) {
      values[current] = `${values[current]} ${line.trim()}`.trim()
    }
  }
  return { keys, values }
}

function validate(name, dir) {
  const errors = []
  const skillMd = path.join(dir, 'SKILL.md')
  if (!fs.existsSync(skillMd)) return [`${name}: SKILL.md 가 없습니다`]

  let fm
  try {
    fm = readFrontmatter(skillMd)
  } catch (err) {
    return [`${name}: ${err.message}`]
  }

  for (const key of fm.keys) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(
        `${name}: frontmatter 키 "${key}" 는 claude.ai 업로드에서 거부됩니다 ` +
          `(허용: ${[...ALLOWED_KEYS].join(', ')})`,
      )
    }
  }

  const declared = fm.values.name
  if (declared && declared !== name) {
    errors.push(`${name}: frontmatter name("${declared}") 이 폴더 이름과 다릅니다`)
  }
  const id = declared || name
  if (id.length > 64) errors.push(`${name}: name 이 64자를 넘습니다 (${id.length}자)`)
  if (!/^[a-z0-9-]+$/.test(id)) {
    errors.push(`${name}: name 은 소문자·숫자·하이픈만 쓸 수 있습니다`)
  }
  for (const word of RESERVED) {
    if (id.includes(word)) errors.push(`${name}: name 에 예약어 "${word}" 를 쓸 수 없습니다`)
  }

  const description = fm.values.description ?? ''
  if (!description) errors.push(`${name}: description 이 비어 있습니다`)
  if (description.length > 1024) {
    errors.push(`${name}: description 이 1024자를 넘습니다 (${description.length}자)`)
  }

  let bytes = 0
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else bytes += fs.statSync(full).size
    }
  }
  walk(dir)
  if (bytes >= MAX_UNCOMPRESSED) {
    errors.push(`${name}: 압축 해제 크기가 30MB 이상입니다 (${(bytes / 1e6).toFixed(1)}MB)`)
  }

  return errors
}

const requested = process.argv.slice(2)
const names = fs
  .readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((n) => requested.length === 0 || requested.includes(n))

if (names.length === 0) {
  console.error('패키징할 스킬이 없습니다.')
  process.exit(1)
}

const errors = names.flatMap((n) => validate(n, path.join(SKILLS_DIR, n)))
if (errors.length > 0) {
  console.error('업로드 규격 검사 실패:\n')
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const name of names) {
  const zipPath = path.join(OUT_DIR, `${name}.zip`)
  fs.rmSync(zipPath, { force: true })
  // skills/ 에서 실행해 ZIP 안에 <name>/SKILL.md 구조가 남게 한다.
  execFileSync('zip', ['-r', '-q', '-X', zipPath, name, '-x', '.*', '-x', '*/.*'], {
    cwd: SKILLS_DIR,
  })
  const kb = (fs.statSync(zipPath).size / 1024).toFixed(1)
  console.log(`  ✓ dist/skills/${name}.zip  (${kb} KB)`)
}
console.log(`\n스킬 ${names.length}개를 dist/skills/ 에 패키징했습니다.`)
