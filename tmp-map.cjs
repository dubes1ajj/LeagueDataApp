const fs = require('fs');
const { SourceMapConsumer } = require('source-map-js');
const mapPath = 'c:/Users/adubes/LeagueDataApp/dist/assets/analysisRanking-EQmlFzz6.js.map';
const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const consumer = new SourceMapConsumer(rawMap);
const pos = consumer.originalPositionFor({ line: 1, column: 11870 });
console.log(JSON.stringify(pos, null, 2));
consumer.destroy && consumer.destroy();
