// Запуск: node update-list.js  (в папке расширения)
// Собирает sounds/sounds.json из всех аудиофайлов в папке sounds/
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'sounds');
const list = fs.readdirSync(dir).filter(f => /\.(mp3|ogg|wav|m4a|webm)$/i.test(f)).sort();
fs.writeFileSync(path.join(dir, 'sounds.json'), JSON.stringify(list, null, 2));
console.log(`sound dah: найдено файлов — ${list.length}`);
