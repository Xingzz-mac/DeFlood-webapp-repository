import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(testDirectory, '..')
const repositoryRoot = path.resolve(packageRoot, '..', '..')

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(target) : [target]
  })
}

describe('DeFlood Guardian package boundaries', () => {
  it.each([
    ['src/assets/mascot/deflood-guardian-idle.png', '4b883175a1e7a1f45528841a45738a38737ea1dc5fc0a6520b0af4b5e35dba72'],
    ['src/assets/mascot/deflood-guardian-hover.png', '3e606f3d61db0d7d888c53ece72f6011a9491fca21c627e5bdcfb87b7817ce04'],
  ])('uses the unchanged official mascot asset %s', (relativePath, expectedHash) => {
    const asset = fs.readFileSync(path.join(repositoryRoot, relativePath))
    expect(createHash('sha256').update(asset).digest('hex')).toBe(expectedHash)
  })

  it('contains no AI, webhook, or environmental request implementation', () => {
    const desktopSource = sourceFiles(path.join(packageRoot, 'src'))
      .map(file => fs.readFileSync(file, 'utf8'))
      .join('\n')

    expect(desktopSource).not.toMatch(/\bfetch\s*\(/)
    expect(desktopSource).not.toMatch(/XMLHttpRequest|axios/i)
    expect(desktopSource).not.toMatch(/webhook|open-meteo|glofas|groq|n8n/i)
  })

  it('keeps the local renderer executable as a plain browser script', () => {
    const rendererSource = fs.readFileSync(path.join(packageRoot, 'src', 'renderer.ts'), 'utf8')
    const typeScriptConfig = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'tsconfig.json'), 'utf8'),
    ) as { compilerOptions?: { moduleDetection?: string } }

    expect(rendererSource).not.toMatch(/^\s*(?:import|export)\b/m)
    expect(typeScriptConfig.compilerOptions?.moduleDetection).toBe('legacy')
  })

  it('declares the custom scheme and uses an installable Windows target', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as {
      build?: {
        protocols?: Array<{ schemes?: string[] }>
        win?: { target?: string }
      }
    }

    expect(packageJson.build?.protocols?.some(({ schemes }) => (
      schemes?.includes('defloodguardian')
    ))).toBe(true)
    expect(packageJson.build?.win?.target).toBe('nsis')
  })

  it('requests one app instance and handles both macOS and argv protocol delivery', () => {
    const mainSource = fs.readFileSync(path.join(packageRoot, 'src', 'main.ts'), 'utf8')

    expect(mainSource).toContain('app.requestSingleInstanceLock()')
    expect(mainSource).toContain("app.on('open-url'")
    expect(mainSource).toContain("app.on('second-instance'")
    expect(mainSource).toContain('protocolCommandFromArguments(process.argv)')
  })

  it('keeps a transparent frameless window while disabling the native outer shadow', () => {
    const mainSource = fs.readFileSync(path.join(packageRoot, 'src', 'main.ts'), 'utf8')
    const styles = fs.readFileSync(path.join(packageRoot, 'renderer', 'styles.css'), 'utf8')

    expect(mainSource).toContain('transparent: true')
    expect(mainSource).toContain("backgroundColor: '#00000000'")
    expect(mainSource).toContain('frame: false')
    expect(mainSource).toContain('hasShadow: false')
    expect(mainSource).toContain('guardianWindow.setHasShadow(false)')
    expect(styles).not.toMatch(/\.guardian-frame[\s\S]*?drop-shadow/)
    expect(styles).toMatch(/\.help-bubble[\s\S]*?box-shadow:\s*0 8px 20px/)
    expect(styles).toMatch(/background:\s*transparent/)
  })
})
