import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveXcodeDeveloperDirectory } from './xcode-path.mjs';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  'ios/App/App.xcodeproj/project.pbxproj',
  'ios/App/App/Info.plist',
  'ios/App/App/PrivacyInfo.xcprivacy',
  'ios/App/CapApp-SPM/Package.swift',
  'ios/App/App/public/index.html',
  'ios/App/App/public/main.js',
  'ios/App/App/public/data.json',
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-Growth-1024.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/Splash-Growth-2732.jpg'
];

const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('iOS 工程缺少文件：\n' + missing.join('\n'));
  process.exit(1);
}

for (const file of [
  'ios/App/App/Info.plist',
  'ios/App/App/PrivacyInfo.xcprivacy',
  'ios/App/App.xcodeproj/project.pbxproj'
]) {
  execFileSync('plutil', ['-lint', path.join(root, file)], { stdio: 'inherit' });
}

const packageText = fs.readFileSync(path.join(root, 'ios/App/CapApp-SPM/Package.swift'), 'utf8');
for (const plugin of ['CapacitorCamera', 'CapacitorShare']) {
  if (!packageText.includes(plugin)) throw new Error(`Swift Package 缺少插件：${plugin}`);
}
if (!packageText.includes('platforms: [.iOS(.v14)]')) throw new Error('Swift Package 最低系统版本应为 iOS 14');

const plist = fs.readFileSync(path.join(root, 'ios/App/App/Info.plist'), 'utf8');
for (const key of [
  'CFBundleDisplayName',
  'ITSAppUsesNonExemptEncryption',
  'NSCameraUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSPhotoLibraryAddUsageDescription'
]) {
  if (!plist.includes(`<key>${key}</key>`)) throw new Error(`Info.plist 缺少权限说明：${key}`);
}

const privacy = fs.readFileSync(path.join(root, 'ios/App/App/PrivacyInfo.xcprivacy'), 'utf8');
if (!privacy.includes('<key>NSPrivacyTracking</key>') || !privacy.includes('<false/>')) {
  throw new Error('隐私清单必须明确声明不跟踪用户');
}
const project = fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
if (!project.includes('PrivacyInfo.xcprivacy in Resources')) throw new Error('隐私清单没有加入 iOS Resources 构建阶段');
if (!project.includes('IPHONEOS_DEPLOYMENT_TARGET = 14.0;')) throw new Error('iOS Deployment Target 应为 14.0');

const capacitorConfig = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
if (capacitorConfig.appId !== 'com.childgrowth.app' || capacitorConfig.appName !== '孩子成长') {
  throw new Error('Capacitor App ID 或显示名称不正确');
}
if (capacitorConfig.ios?.contentInset !== 'never') throw new Error('iOS WebView 安全区配置不正确');

const mainJs = fs.readFileSync(path.join(root, 'www/main.js'), 'utf8');
for (const unsupported of ['.at(', 'toISOString().slice(0, 10)']) {
  if (mainJs.includes(unsupported)) throw new Error(`发现不符合 iOS 14 兼容要求的写法：${unsupported}`);
}
for (const marker of ['aria-modal="true"', 'aria-live', 'normalizeDatabase']) {
  if (!mainJs.includes(marker)) throw new Error(`App 缺少产品化保护：${marker}`);
}

const data = JSON.parse(fs.readFileSync(path.join(root, 'www/data.json'), 'utf8'));
const milestoneCount = data.milestones?.bands?.flatMap(band => band.domains.flatMap(domain => domain.items)).length;
if (milestoneCount !== 434) throw new Error(`里程碑数据数量异常：${milestoneCount}`);

for (const asset of ['index.html', 'main.js', 'style.css', 'data.json', 'app-icon.png']) {
  const web = fs.readFileSync(path.join(root, 'www', asset));
  const native = fs.readFileSync(path.join(root, 'ios/App/App/public', asset));
  if (!web.equals(native)) throw new Error(`iOS 原生资源尚未同步：${asset}`);
}

const iconInfo = execFileSync('sips', [
  '-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha',
  path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-Growth-1024.png')
], { encoding: 'utf8' });
if (!iconInfo.includes('pixelWidth: 1024') || !iconInfo.includes('pixelHeight: 1024') || !iconInfo.includes('hasAlpha: no')) {
  throw new Error('App Icon 必须为 1024×1024 且不能包含透明通道');
}

const splashInfo = execFileSync('sips', [
  '-g', 'pixelWidth', '-g', 'pixelHeight',
  path.join(root, 'ios/App/App/Assets.xcassets/Splash.imageset/Splash-Growth-2732.jpg')
], { encoding: 'utf8' });
if (!splashInfo.includes('pixelWidth: 2732') || !splashInfo.includes('pixelHeight: 2732')) {
  throw new Error('启动图必须为 2732×2732');
}

const xcodePath = resolveXcodeDeveloperDirectory(root);
console.log('\niOS 工程静态检查通过。');
if (!xcodePath) {
  console.log('尚未安装完整 Xcode：工程与资源已就绪，但暂时不能生成模拟器 App。');
  process.exit(0);
}
console.log(`检测到完整 Xcode：${xcodePath}`);
console.log('可以执行 npm run ios:build。');
