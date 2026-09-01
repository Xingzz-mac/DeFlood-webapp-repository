import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDirectory, '..')
const repositoryRoot = path.resolve(packageRoot, '..', '..')
const destinationRoot = path.join(packageRoot, 'dist')

fs.cpSync(path.join(packageRoot, 'renderer'), path.join(destinationRoot, 'renderer'), { recursive: true })
fs.mkdirSync(path.join(destinationRoot, 'assets'), { recursive: true })

for (const [source, destination] of [
  ['src/assets/mascot/deflood-guardian-idle.png', 'deflood-guardian-idle.png'],
  ['src/assets/mascot/deflood-guardian-hover.png', 'deflood-guardian-hover.png'],
  ['src/assets/branding/deflood-app-icon.png', 'deflood-app-icon.png'],
]) {
  fs.copyFileSync(path.join(repositoryRoot, source), path.join(destinationRoot, 'assets', destination))
}
