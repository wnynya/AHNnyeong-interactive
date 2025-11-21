import WebsocketClient from '../websocket-client.mjs';
import TouchCursor from './touch-cursor.js';

let wsc;
let touchCursor;

const canvas = document.querySelector('#canvas');
canvas.width = canvas.offsetWidth * 2;
canvas.height = canvas.offsetHeight * 2;
const ctx = canvas.getContext('2d');

function frame() {
  draw();
  window.requestAnimationFrame(frame);
}
window.requestAnimationFrame(frame);

function draw() {}

function init() {
  wsc = new WebsocketClient('/target');
  wsc.on('open', () => {
    console.log('wsc open');
  });
  wsc.on('json', (con, event, data) => {
    console.log(event, data);
  });
  wsc.on('close', () => {
    console.log('wsc close');
  });
  wsc.on('error', () => {
    console.log('wsc error');
  });
  wsc.open();

  touchCursor = new TouchCursor(document.querySelector('#touch'));
}
init();
