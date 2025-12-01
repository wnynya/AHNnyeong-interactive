import WebSocketClient from './websocket-client.mjs';

const wscs = new WebSocketClient('/source');
wscs.on('open', () => {
  console.log('open source');
});
wscs.open();

const wsct = new WebSocketClient('/target');
wsct.on('open', () => {
  console.log('open source');
});
wsct.open();

document
  .querySelector('#button-reload-target')
  .addEventListener('click', () => {
    wscs.event('refresh');
  });

document
  .querySelector('#button-reload-source')
  .addEventListener('click', () => {
    wsct.event('refresh');
  });
