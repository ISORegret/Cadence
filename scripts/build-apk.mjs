/**
 * Web build + cap sync + Gradle assembleDebug (unsigned debug APK).
 * Gradle writes: android/app/build/outputs/apk/debug/app-debug.apk
 * We copy that to release/cadence-release.apk so you can commit it and CI can publish it.
 */
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const androidDir = path.join(root, 'android')
const builtApk = path.join(
  androidDir,
  'app/build/outputs/apk/debug/app-debug.apk',
)
const releaseApk = path.join(root, 'release', 'cadence-release.apk')
const isWin = process.platform === 'win32'
const gradle = isWin ? 'gradlew.bat' : './gradlew'

execSync('npm run build', { cwd: root, stdio: 'inherit', shell: isWin })
execSync('npx cap sync', { cwd: root, stdio: 'inherit', shell: isWin })
execSync(`${gradle} assembleDebug`, {
  cwd: androidDir,
  stdio: 'inherit',
  shell: true,
})

mkdirSync(path.dirname(releaseApk), { recursive: true })
copyFileSync(builtApk, releaseApk)
console.log(`\nCopied debug APK → ${releaseApk}\nCommit and push this file to publish via GitHub Actions.\n`)
