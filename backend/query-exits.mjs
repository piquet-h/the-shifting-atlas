import gremlin from 'gremlin';

const { DriverRemoteConnection } = gremlin.driver;
const { Graph } = gremlin.structure;
const __ = gremlin.process.statics;

const endpoint = process.env.COSMOS_GREMLIN_ENDPOINT.replace('https://', 'wss://') + ':443/';
const primaryKey = process.env.COSMOS_GREMLIN_KEY;
const database = process.env.COSMOS_GREMLIN_DATABASE;
const graph = process.env.COSMOS_GREMLIN_GRAPH;

const authenticator = new gremlin.driver.auth.PlainTextSaslAuthenticator(
  `/dbs/${database}/colls/${graph}`,
  primaryKey
);

const connection = new DriverRemoteConnection(endpoint, {
  authenticator,
  traversalsource: 'g',
  rejectUnauthorized: true,
  mimeType: 'application/vnd.gremlin-v2.0+json'
});

const g = new Graph().traversal().withRemote(connection);

console.log('\n📍 Querying exits from key locations...\n');

try {
  // Query South Farms exits
  console.log('South Farms (ec88e970-9d2b-4a34-9804-6b2afd5adb9e):');
  const sfExits = await g.V('ec88e970-9d2b-4a34-9804-6b2afd5adb9e')
    .outE()
    .project('direction', 'to')
    .by('direction')
    .by(__.inV().values('name'))
    .toList();
  sfExits.forEach(exit => {
    console.log(`  ${exit.direction} → ${exit.to}`);
  });

  // Query Field Edge Track exits
  console.log('\nField Edge Track (e82c9f17-ffc0-4b27-bcfe-5b8e3b2ea5f3):');
  const feExits = await g.V('e82c9f17-ffc0-4b27-bcfe-5b8e3b2ea5f3')
    .outE()
    .project('direction', 'to')
    .by('direction')
    .by(__.inV().values('name'))
    .toList();
  feExits.forEach(exit => {
    console.log(`  ${exit.direction} → ${exit.to}`);
  });

  // Query Southwest Junction exits
  console.log('\nSouthwest Junction (d49dd2df-1a1b-4f85-8c84-6a4f6ae1481d):');
  const swExits = await g.V('d49dd2df-1a1b-4f85-8c84-6a4f6ae1481d')
    .outE()
    .project('direction', 'to')
    .by('direction')
    .by(__.inV().values('name'))
    .toList();
  swExits.forEach(exit => {
    console.log(`  ${exit.direction} → ${exit.to}`);
  });

  console.log('\n✅ Query complete\n');
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
} finally {
  await connection.close();
}

process.exit(0);
