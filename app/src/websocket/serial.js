import WebSocketServer from './websocket-server.js';

const source = new WebSocketServer();
const target = new WebSocketServer();

source.on('message', (con, read) => {
  target.broadcast(read.data);
});

export { source, target };
