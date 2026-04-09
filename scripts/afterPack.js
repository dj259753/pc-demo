/**
 * afterPack.js — electron-builder afterPack 钩子
 *
 * 在 electron-builder 完成 asar 打包后执行，负责将当前架构对应的
 * resources/targets/<platform>-<arch>/ 资源拷贝到产物的 Resources/resources/ 目录。
 *
 * 打包后的目录结构（macOS .app）：
 *   QQ宠物.app/Contents/Resources/resources/
 *     ├── gateway/           (OpenClaw Gateway + node_modules)
 *     ├── runtime/           (内嵌 Node.js)
 *     ├── workspace-defaults/
 *     └── app-icon.png
 *
 * constants.js 中 resolveResourcesPath() 在 packaged 模式下读取：
 *   path.join(process.resourcesPath, 'resources')
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

module.exports = async function afterPack(context) {
  const { electronPlatformName, arch } = context;

  // electron-builder arch 枚举: 1=x64, 3=arm64, 0=ia32, 4=universal
  const archName = { 0: 'ia32', 1: 'x64', 3: 'arm64', 4: 'universal' }[arch] || `unknown-${arch}`;
  const target = `${electronPlatformName}-${archName}`;

  const projectDir = path.resolve(__dirname, '..');
  const srcDir = path.join(projectDir, 'resources', 'targets', target);

  // macOS: QQ宠物.app/Contents/Resources/
  const appOutDir = context.appOutDir;
  const resourcesDir = path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources');
  const destDir = path.join(resourcesDir, 'resources');

  console.log(`[afterPack] platform=${electronPlatformName} arch=${archName} target=${target}`);
  console.log(`[afterPack] src: ${srcDir}`);
  console.log(`[afterPack] dest: ${destDir}`);

  if (!fs.existsSync(srcDir)) {
    console.warn(`[afterPack] ⚠️  资源目录不存在: ${srcDir}`);
    console.warn(`[afterPack]    请先在该目录下执行 npm install 安装 Gateway 依赖`);
    return;
  }

  // 创建目标目录
  fs.mkdirSync(destDir, { recursive: true });

  // 用 rsync 拷贝，排除不需要的文件
  // 注意：不能用 '*.md' 全局排除，因为 openclaw/docs/reference/templates/*.md
  //       是 Agent 运行必需的模板文件（AGENTS.md, SOUL.md 等）
  const rsyncArgs = [
    '-a',                           // 递归 + 保留权限
    '--exclude', '.DS_Store',
    '--exclude', 'README.md',       // 各模块的 README 不需要
    '--exclude', 'README*.md',
    '--exclude', 'CHANGELOG.md',
    '--exclude', 'CHANGELOG*.md',
    '--exclude', 'CONTRIBUTING.md',
    '--exclude', 'LICENSE.md',
    '--exclude', 'HISTORY.md',
    '--exclude', 'package-lock.json', // gateway 的 lockfile 不需要打进包
    `${srcDir}/`,                   // 源（尾部 / 表示拷贝内容而非目录本身）
    `${destDir}/`,                  // 目标
  ];

  console.log(`[afterPack] rsync ${rsyncArgs.join(' ')}`);

  try {
    execSync(`rsync ${rsyncArgs.map(a => `"${a}"`).join(' ')}`, {
      stdio: 'inherit',
    });
    console.log(`[afterPack] ✅ 资源拷贝完成`);
  } catch (err) {
    console.error(`[afterPack] ❌ rsync 失败:`, err.message);
    throw err;
  }

  // 统计大小
  try {
    const size = execSync(`du -sh "${destDir}" 2>/dev/null`, { encoding: 'utf-8' }).trim().split('\t')[0];
    console.log(`[afterPack] 资源总大小: ${size}`);
  } catch {
    // 忽略统计失败
  }
};
