#!/usr/bin/env node
/**
 * Generate a visual map representation of the location graph
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const locationsFile = join(__dirname, '../backend/src/data/villageLocations.json');
const locations = JSON.parse(readFileSync(locationsFile, 'utf-8'));

// Build location lookup
const locById = new Map();
for (const loc of locations) {
  locById.set(loc.id, loc);
}

// Build connection map: from -> direction -> to
const connections = new Map();
for (const loc of locations) {
  if (!loc.exits) continue;
  
  for (const exit of loc.exits) {
    const key = `${loc.id}:${exit.direction}`;
    connections.set(key, { from: loc.id, to: exit.to, direction: exit.direction });
  }
}

// Check for reciprocals
function hasReciprocal(from, dir, to) {
  const opposites = {
    north: 'south', south: 'north',
    east: 'west', west: 'east',
    northeast: 'southwest', southwest: 'northeast',
    northwest: 'southeast', southeast: 'northwest',
    up: 'down', down: 'up',
    in: 'out', out: 'in'
  };
  
  const reverseDir = opposites[dir];
  if (!reverseDir) return false;
  
  const reverseKey = `${to}:${reverseDir}`;
  const reverse = connections.get(reverseKey);
  
  return reverse && reverse.to === from;
}

console.log('\n📍 LOCATION MAP\n');
console.log('═'.repeat(80));

// Group by tags if available, or show all
const sorted = [...locations].sort((a, b) => a.name.localeCompare(b.name));

for (const loc of sorted) {
  console.log(`\n${loc.name}`);
  console.log('─'.repeat(loc.name.length));
  
  if (!loc.exits || loc.exits.length === 0) {
    console.log('  (no exits)');
    continue;
  }
  
  for (const exit of loc.exits) {
    const target = locById.get(exit.to);
    const targetName = target ? target.name : '???';
    const hasReverse = hasReciprocal(loc.id, exit.direction, exit.to);
    const symbol = hasReverse ? '⇄' : '→';
    const color = hasReverse ? '' : '⚠️  ';
    
    console.log(`  ${color}${exit.direction.padEnd(10)} ${symbol} ${targetName}`);
  }
}

console.log('\n' + '═'.repeat(80));

// Summary
const totalExits = locations.reduce((sum, loc) => sum + (loc.exits?.length || 0), 0);
let oneWay = 0;
let bidirectional = 0;

for (const [key, conn] of connections) {
  if (hasReciprocal(conn.from, conn.direction, conn.to)) {
    bidirectional++;
  } else {
    oneWay++;
  }
}

console.log(`\nTotal Locations: ${locations.length}`);
console.log(`Total Exits: ${totalExits}`);
console.log(`Bidirectional: ${bidirectional}`);
console.log(`One-way: ${oneWay} ⚠️`);
console.log('\nLegend: ⇄ = bidirectional, → = one-way, ⚠️ = missing reciprocal\n');
