import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { learningTasks, learningData } from '../data/learning-catalog.mjs';
import { cultivationEvidence } from '../data/cultivation-evidence.mjs';
import { domainCultivation, domainSources } from '../data/domain-cultivation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Run tests before packaging to catch regressions
console.log('Running tests before packaging...');
execFileSync(process.execPath, ['--test', 'app/tests/*.test.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(root, 'app/scripts/sync-data.mjs')], { stdio: 'inherit' });
const web = path.join(root, 'app/www');
const files = ['index.html', 'main.js', 'style.css', 'growth-progress.js', 'data.json', 'app-icon.png', 'talent-mark.svg', 'talent-ui.js', 'talent-store.js', 'talent-insights.js', 'talent-journey.js', 'talent-cloud.js', 'talent.css', 'talent-data.js', 'learning-data.js', 'learning-ui.js', 'cultivation-data.js', 'cultivation-ui.js', 'talent-planets.js', 'talent-planets-ui.js'];
const hash = crypto.createHash('sha256');
for (const name of files) {
  if (!fs.statSync(path.join(web, name)).isFile()) throw new Error('Missing static file: ' + name);
  hash.update(name).update('\0').update(fs.readFileSync(path.join(web, name)));
}
const releaseId = hash.digest('hex').slice(0, 16);
const output = path.join(root, 'outputs/tencent-cloud');
const staged = path.join(output, releaseId);
fs.mkdirSync(staged, { recursive: true });
for (const name of files) fs.copyFileSync(path.join(web, name), path.join(staged, name));
const catalog = JSON.parse(fs.readFileSync(path.join(web, 'data.json'), 'utf8'));
const require = createRequire(import.meta.url);
const originalTalent = require(path.join(root, 'data/talent-catalog.js'));
const talent = {...originalTalent,tasks:[...originalTalent.tasks,...learningTasks]};
// Refuse incomplete content releases instead of publishing empty age/ability cells.
const coverage = talent.ageGroups.map(age => ({
  age: age.id,
  directions: Object.fromEntries(talent.directions.map(direction => [direction.id, talent.tasks.filter(task => task.directionId === direction.id && task.ageGroups.includes(age.id)).length]))
}));
for (const row of coverage) for (const [direction, count] of Object.entries(row.directions)) {
  if (count < 10) throw new Error(`Incomplete exploration content: ${row.age}/${direction} has ${count}, needs 10`);
}
if (new Set(talent.tasks.map(task => task.id)).size !== talent.tasks.length) throw new Error('Duplicate exploration task ID');
for (const task of talent.tasks) {
  if (!/^[A-Za-z0-9_\-\u3400-\u9fff]{1,120}$/.test(task.id)) throw new Error('Unsupported task ID: ' + task.id);
  if (!['start', 'practice', 'apply'].includes(task.level)) throw new Error('Missing exploration level: ' + task.id);
  for (const field of ['materials', 'steps', 'observe', 'reflection', 'rubric']) {
    if (!Array.isArray(task[field]) || !task[field].length || task[field].some(item => typeof item !== 'string' || !item.trim())) throw new Error(`Missing ${field}: ${task.id}`);
  }
  for (const field of ['title', 'summary', 'deliverable', 'transfer']) {
    if (typeof task[field] !== 'string' || !task[field].trim()) throw new Error(`Missing ${field}: ${task.id}`);
  }
  for (const level of ['start', 'practice', 'apply']) {
    if (typeof task.adaptations?.[level] !== 'string' || !task.adaptations[level].trim()) throw new Error(`Missing ${level} adaptation: ${task.id}`);
  }
}
const manifest = {
  product: '天赋生长',
  version: '2.3.0',
  releaseId,
  builtAt: new Date().toISOString(),
  files,
  milestones: catalog.milestones.bands.reduce((count, band) => count + band.count, 0),
  talentTasks: talent.tasks.length,
  originalTasks: originalTalent.tasks.length,
  learningWorlds: learningData.worlds.length,
  learningStages: learningData.stages.length,
  learningResources: learningData.resources.length,
  cultivationDomains:domainCultivation.length,
  cultivationEvidence:cultivationEvidence.length,
  cultivationSources:domainSources.length,
  planetDisplay:'exploration evidence; not a validated talent or ability measure',
  talentDirections: talent.directions.length,
  talentCoverage: coverage,
  ageGroups: talent.ageGroups.map(age => age.id),
  dataLocation: 'browser localStorage / IndexedDB; optional account backup API; no personal data in this static bundle'
};
fs.writeFileSync(path.join(staged, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
const archive = path.join(output, `talent-growth-${releaseId}.tar.gz`);
execFileSync('tar', ['-czf', archive, '-C', staged, ...files, 'release.json'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
const record = { releaseId, archive, sha256, bytes: fs.statSync(archive).size };
fs.writeFileSync(path.join(output, 'latest.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record));
