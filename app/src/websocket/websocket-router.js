const servers = {};
function websocket(req, socket, head) {
  const path = req.url.replace(/\?(.*)/, '').toLowerCase();
  const server = servers[path];
  if (!server) {
    socket.destroy();
    return;
  }
  server.handleUpgrade(req, socket, head);
}
function use(path, server) {
  servers[path] = server;
}

import { source, target } from './wss.js';
use('/source', source);
use('/target', target);

export default websocket;
