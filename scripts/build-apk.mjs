/**
 * Web build + cap sync + Gradle assembleDebug (unsigned debug APK).
 * Output: android/app/build/outputs/apk/debug/app-debug.apk
 */
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const androidDir = path.join(root, 'android')
const isWin = process.platform === 'win32'
const gradle = isWin ? 'gradlew.bat' : './gradlew'

execSync('npm run build', { cwd: root, stdio: 'inherit', shell: isWin })
execSync('npx cap sync', { cwd: root, stdio: 'inherit', shell: isWin })
execSync(`${gradle} assembleDebug`, {
  cwd: androidDir,
  stdio: 'inherit',
  shell: true,
})
