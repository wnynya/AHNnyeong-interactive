import { SerialPort } from 'serialport';

SerialPort.list().then((list) => {
  console.log('Serials: ');
  list.forEach((e) => {
    console.log(e);
  });
});
