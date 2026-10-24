import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { learningData, learningTasks } from '../../data/learning-catalog.mjs';
import { cultivationEvidence } from '../../data/cultivation-evidence.mjs';
import { domainCultivation, domainSources } from '../../data/domain-cultivation.mjs';

const domainIds = new Set(learningData.worlds.map(w=>w.id));
if(cultivationEvidence.some(s=>new URL(s.url).protocol!=='https:') || domainSources.some(s=>new URL(s.url).protocol!=='https:'))throw new Error('Cultivation sources require HTTPS');
if(new Set(domainCultivation.map(d=>d.domainId)).size!==domainIds.size || domainCultivation.some(d=>!domainIds.has(d.domainId)))throw new Error('Incomplete cultivation domains');
for(const d of domainCultivation){
  if(d.sourceIds.some(id=>!domainSources.some(s=>s.id===id)))throw new Error('Missing cultivation source '+d.domainId);
  for(const age of ['early','preschool','child','teen','adult','later'])if(typeof d.ageSupport?.[age]!=='string'||!d.ageSupport[age].trim())throw new Error('Missing cultivation age support '+d.domainId+'/'+age);
}
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..', '..');
const out = path.resolve(import.meta.dirname, '..', 'www');
fs.mkdirSync(out, { recursive: true });
const data = {
  milestones: require(path.join(root, 'data/milestones.js')),
  guides: require(path.join(root, 'data/guides.js')),
  safety: require(path.join(root, 'data/safety.js')),
  items: require(path.join(root, 'data/items.js'))
};
fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify(data));
const progressSource = fs.readFileSync(path.join(root, 'utils/growth-progress.js'), 'utf8');
if (!progressSource.includes('module.exports =')) throw new Error('Growth progress module export is missing');
fs.writeFileSync(path.join(out, 'growth-progress.js'), progressSource.replace('module.exports =', 'export default'));
const talentFile = path.join(root, 'data/talent-catalog.js');
if (fs.existsSync(talentFile)) {
  const talent = require(talentFile);
  fs.writeFileSync(path.join(out, 'talent-data.js'), 'export default ' + JSON.stringify({...talent,tasks:[...talent.tasks,...learningTasks]}) + ';\n');
}
fs.writeFileSync(path.join(out, 'learning-data.js'), 'export default ' + JSON.stringify(learningData) + ';\n');
fs.writeFileSync(path.join(out, 'cultivation-data.js'), 'export default ' + JSON.stringify({principles:cultivationEvidence,domains:domainCultivation,sources:domainSources}) + ';\n');
console.log('App data synced:', out);
