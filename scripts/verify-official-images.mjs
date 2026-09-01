import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..')

const officialImages = [
  'src/assets/branding/deflood-app-icon.png',
  'src/assets/branding/deflood-logo-dark.png',
  'src/assets/branding/deflood-logo-light.png',
  'src/assets/branding/deflood-shield.png',
  'src/assets/mascot/deflood-guardian-idle.png',
  'src/assets/mascot/deflood-guardian-hover.png',
]
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const lfsPointerPrefix = 'version https://git-lfs.github.com/spec/v1'

const failures = officialImages.flatMap(relativePath => {
  const absolutePath = path.join(repositoryRoot, relativePath)
  if (!fs.existsSync(absolutePath)) return [`${relativePath}: file is missing`]
  const contents = fs.readFileSync(absolutePath)
  const problems = []
  if (contents.subarray(0, pngSignature.length).toString('hex') !== pngSignature.toString('hex')) {
    problems.push('missing the PNG signature')
  }
  if (contents.subarray(0, lfsPointerPrefix.length).toString('utf8') === lfsPointerPrefix) {
    problems.push('contains Git LFS pointer text instead of image bytes')
  }
  return problems.map(problem => `${relativePath}: ${problem}`)
})

if (failures.length > 0) {
  throw new Error(`Official image integrity check failed:\n- ${failures.join('\n- ')}`)
}

console.log(`Verified ${officialImages.length} official DeFlood PNG assets.`)
