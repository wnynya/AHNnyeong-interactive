import TouchCursor from '../touch-cursor.js';
import DrawingShape from '../drawing-shape.js';
import WebsocketClient from '../websocket-client.mjs';

let wsc;
let touchCursor;
let shapes = [];
let shapets = 0;

const canvas = document.querySelector('#canvas');
canvas.width = canvas.offsetWidth * 2;
canvas.height = canvas.offsetHeight * 2;
const ctx = canvas.getContext('2d');

function frame() {
  draw();
  window.requestAnimationFrame(frame);
}
window.requestAnimationFrame(frame);

function draw() {
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  shapes.forEach((shape) => {
    if (shape.length > 1) {
      shape.strokes.forEach((stroke) => {
        const f = stroke.from;
        const fx = ((f.x + 1) / 2) * w;
        const fy = ((f.y + 1) / 2) * h;
        const t = stroke.to;
        const tx = ((t.x + 1) / 2) * w;
        const ty = ((t.y + 1) / 2) * h;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.stroke();
      });
    }
  });
}

function init() {
  touchCursor = new TouchCursor(document.querySelector('#drawing'));
  touchCursor.on('start', (point) => {
    shapes.push(new DrawingShape());
    shapes[shapes.length - 1].addPoint(point.x, point.y, 1);
    shapets = Date.now();
  });
  touchCursor.on('move', (point) => {
    const t = Date.now() - shapets;
    shapes[shapes.length - 1].addPoint(point.x, point.y, t);
    shapets = Date.now();
  });
  touchCursor.on('end', (point) => {
    const t = Date.now() - shapets;
    shapes[shapes.length - 1].addPoint(point.x, point.y, t);
  });

  wsc = new WebsocketClient('/source');
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
}
init();
