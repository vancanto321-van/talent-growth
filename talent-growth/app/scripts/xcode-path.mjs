import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const appRoot = path.resolve(import.meta.dirname, '..');

function asDeveloperDirectory(candidate) {
  if (!candidate) return null;

  const resolved = path.resolve(candidate);
  if (resolved.endsWith('.app')) return path.join(resolved, 'Contents', 'Developer');
  return resolved;
}

function isCompleteXcode(developerDirectory) {
  if (!developerDirectory) return false;

  return fs.existsSync(path.join(developerDirectory, 'usr', 'bin', 'xcodebuild'))
    && fs.existsSync(path.join(developerDirectory, 'Platforms', 'iPhoneSimulator.platform'));
}

function appDirectories(parent) {
  if (!fs.existsSync(parent)) return [];

  return fs.readdirSync(parent, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^Xcode(?:[-_ ].*)?\.app$/i.test(entry.name))
    .map(entry => path.join(parent, entry.name))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
}

export function resolveXcodeDeveloperDirectory(root = appRoot) {
  const localToolchains = path.join(root, '.toolchains');
  const candidates = [
    process.env.CHILD_GROWTH_XCODE_DIR,
    process.env.DEVELOPER_DIR,
    ...appDirectories(localToolchains),
    path.join(localToolchains, 'Xcode.app'),
    '/Applications/Xcode.app',
    ...appDirectories('/Applications')
  ];

  try {
    candidates.push(execFileSync('xcode-select', ['-p'], { encoding: 'utf8' }).trim());
  } catch {
    // xcode-select may be unavailable on non-macOS CI runners.
  }

  for (const candidate of candidates) {
    const developerDirectory = asDeveloperDirectory(candidate);
    if (isCompleteXcode(developerDirectory)) return developerDirectory;
  }

  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const developerDirectory = resolveXcodeDeveloperDirectory();
  if (developerDirectory) {
    console.log(developerDirectory);
  } else {
    console.error([
      '未检测到包含 iOS Simulator SDK 的完整 Xcode。',
      `项目内安装位置：${path.join(appRoot, '.toolchains')}`,
      '也可以通过 CHILD_GROWTH_XCODE_DIR 指定 Xcode.app 或 Contents/Developer。'
    ].join('\n'));
    process.exit(2);
  }
}
