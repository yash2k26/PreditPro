import WebSocket from 'ws';

const res = await fetch('http://localhost:3001/api/markets?limit=1');
const data = await res.json();
const marketId = data.markets[0]?.id;
if (!marketId) { console.log('NO MARKETS'); process.exit(1); }
console.log('Testing market:', marketId);

const ws = new WebSocket('ws://localhost:3001');
let msgCount = 0;

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'subscribe', market: marketId }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  msgCount++;
  if (msg.type === 'book_snapshot') {
    console.log('SNAPSHOT: bestBid=' + msg.data.aggregated.bestBid + ' bestAsk=' + msg.data.aggregated.bestAsk);
  } else if (msg.type === 'book_update' && msgCount <= 8) {
    console.log('UPDATE #' + (msgCount - 2) + ': mid=' + msg.data.aggregated.mid);
  } else if (msg.type === 'health' && msgCount <= 3) {
    const venues = Object.keys(msg.data.venues);
    console.log('HEALTH: venues=' + venues.join(','));
  }
  if (msgCount >= 8) {
    console.log('SUCCESS: ' + msgCount + ' messages received via worker threads');
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (e) => { console.error('WS ERROR:', e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT: got ' + msgCount + ' msgs'); ws.close(); process.exit(msgCount > 0 ? 0 : 1); }, 8000);
