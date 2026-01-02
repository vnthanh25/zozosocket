const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 4000
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const ZODIAC_DATA = [
    { id: 1, name: 'tý', display: 'Chuột', icon: '🐭' }, { id: 2, name: 'sửu', display: 'Trâu', icon: '🐂' },
    { id: 3, name: 'dần', display: 'Cọp', icon: '🐅' }, { id: 4, name: 'mão', display: 'Mèo', icon: '🐈' },
    { id: 5, name: 'thìn', display: 'Rồng', icon: '🐲' }, { id: 6, name: 'tỵ', display: 'Rắn', icon: '🐍' },
    { id: 7, name: 'ngọ', display: 'Ngựa', icon: '🐎' }, { id: 8, name: 'mùi', display: 'Dê', icon: '🐐' },
    { id: 9, name: 'thân', display: 'Khỉ', icon: '🐒' }, { id: 10, name: 'dậu', display: 'Gà', icon: '🐓' },
    { id: 11, name: 'tuất', display: 'Chó', icon: '🐕' }, { id: 12, name: 'hợi', display: 'Heo', icon: '🐖' },
];

let rooms = {}; // Cấu trúc: { 'room1': { players: {}, gameInterval: null, status: 'waiting' } }

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        if (!data || !data.roomID || !data.username) return;
        const { username, roomID } = data;

        socket.join(roomID);
        if (!rooms[roomID]) {
            rooms[roomID] = { players: {}, gameInterval: null };
        }
        rooms[roomID].players[socket.id] = { id: socket.id, username, score: 0, roomID };
        io.to(roomID).emit('update_players', Object.values(rooms[roomID].players));
    });

    socket.on('start_game', ({ roomID, config }) => {
        const room = rooms[roomID];
        if (!room) return;

        let turn = 0;
        const maxTurns = parseInt(config.maxTurns) || 5;
        const timeMs = (parseFloat(config.timePerTurn) || 2) * 1000;

        // Reset điểm cho mọi người trong phòng
        Object.keys(room.players).forEach(id => room.players[id].score = 0);
        io.to(roomID).emit('update_players', Object.values(room.players));

        if (room.gameInterval) clearInterval(room.gameInterval);

        room.gameInterval = setInterval(() => {
            turn++;
            if (turn <= maxTurns) {
                const animals = Array.from({ length: 6 }, () => ({
                    ...ZODIAC_DATA[Math.floor(Math.random() * 12)],
                    instanceId: Math.random().toString(36).substr(2, 9)
                }));
                const target = animals[Math.floor(Math.random() * 6)];
                io.to(roomID).emit('new_turn', { animals, target, turnCount: turn, timePerTurn: timeMs, maxTurns });
            } else {
                clearInterval(room.gameInterval);
                io.to(roomID).emit('game_over', Object.values(room.players));
            }
        }, timeMs);
    });

    socket.on('submit_win', (payload) => {
        // payload là dữ liệu gửi từ client lên. Ta kiểm tra xem nó có tồn tại ko.
        if (!payload || !payload.roomID) {
            console.log("Cảnh báo: Có người thắng nhưng thiếu roomID");
            return;
        }
    
        const targetRoomID = payload.roomID;
        const room = rooms[targetRoomID];
    
        if (room && room.players[socket.id]) {
            room.players[socket.id].score++;
            // Gửi cập nhật điểm cho tất cả mọi người TRONG PHÒNG ĐÓ
            io.to(targetRoomID).emit('update_players', Object.values(room.players));
        }
    });

    socket.on('disconnect', () => {
        // Tìm xem socket này ở phòng nào để xóa
        for (const roomID in rooms) {
            if (rooms[roomID].players[socket.id]) {
                const username = rooms[roomID].players[socket.id].username;
                delete rooms[roomID].players[socket.id];
                io.to(roomID).emit('update_players', Object.values(rooms[roomID].players));

                // Xóa phòng nếu không còn ai
                if (Object.keys(rooms[roomID].players).length === 0) {
                    if (rooms[roomID].gameInterval) clearInterval(rooms[roomID].gameInterval);
                    delete rooms[roomID];
                }
                break;
            }
        }
    });
});

server.listen(port, () => console.log("Server Room Management on port 3001"));