const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 4000;
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

let rooms = {};

// Hàm tạo dữ liệu lượt chơi (Helper)
const createTurnData = (config) => {
    const maxTurns = parseInt(config.maxTurns) || 5;
    const timePerTurn = (parseFloat(config.timePerTurn) || 5) * 1000;
    const targetCount = parseInt(config.targetCount) || 1; // Lấy từ Client
    const poolSize = parseInt(config.poolSize) || 12; // Lấy từ Client
    const gridSize = parseInt(config.gridSize) || 12;      // Lấy từ Client

    if (poolSize > 12) poolSize = 12;
    if (targetCount * 2 > poolSize) targetCount = poolSize / 2;
    if (gridSize < targetCount * 2) gridSize = targetCount * 2

    // 1. Chọn ra danh sách các loài sẽ tham gia ván này
    const selectedSpecies = [...ZODIAC_DATA]
        .sort(() => 0.5 - Math.random())
        .slice(0, Math.min(poolSize, 12));
    // 2. Tạo lưới bằng cách lặp lại các loài trong selectedSpecies cho đến khi đủ gridSize
    let animalsRaw = [];
    for (let i = 0; i < gridSize; i++) {
        // Lấy con vật theo cơ chế xoay vòng (Round-robin)
        const baseAnimal = selectedSpecies[i % selectedSpecies.length];
        animalsRaw.push({
            ...baseAnimal,
            instanceId: Math.random().toString(36).substr(2, 9)
        });
    }
    // 3. Xáo trộn toàn bộ lưới để vị trí các con trùng nhau không nằm cạnh nhau một cách máy móc
    const animals = animalsRaw.sort(() => 0.5 - Math.random());

    // 4. Chọn mục tiêu dựa trên targetCount từ client
    // Lấy danh sách icon duy nhất hiện có trên lưới
    const uniqueOnGrid = Array.from(new Set(animals.map(a => a.id)))
        .map(id => animals.find(a => a.id === id));

    // Xáo trộn và lấy đúng số lượng mục tiêu yêu cầu
    const target = uniqueOnGrid
        .sort(() => 0.5 - Math.random())
        .slice(0, Math.min(targetCount, uniqueOnGrid.length));

    return {
        animals,
        target,
        timePerTurn: timePerTurn,
        maxTurns
    };
};

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

        room.config = config; // Lưu cấu hình (bao gồm turnMode: 'personal' hoặc 'room')
        const maxGameTime = parseInt(config.maxGameTime) || 60;

        Object.keys(room.players).forEach(id => room.players[id].score = 0);
        io.to(roomID).emit('update_players', Object.values(room.players));

        // Phát lượt đầu tiên cho mọi người
        if (config.turnMode === 'personal') {
            Object.keys(room.players).forEach(playerId => {
                const turnData = createTurnData(config);
                io.to(playerId).emit('personal_new_turn', turnData);
            });
        } else {
            // Chế độ Room: Phát chung một lượt cho cả phòng
            const commonTurn = createTurnData(config);
            io.to(roomID).emit('new_turn', commonTurn);
        }

        // Quản lý tổng thời gian ván đấu
        if (room.gameTimeout) clearTimeout(room.gameTimeout);
        room.gameTimeout = setTimeout(() => {
            if (rooms[roomID]) {
                io.to(roomID).emit('game_over', Object.values(rooms[roomID].players));
            }
        }, maxGameTime * 1000);
    });

    // // --- SỰ KIỆN MỚI 1: Yêu cầu lượt mới cá nhân ---
    // socket.on('request_next_turn_personal', ({ roomID }) => {
    //     const room = rooms[roomID];
    //     if (room) {
    //         // Cộng điểm cho người vừa yêu cầu (vì họ đã hoàn thành lượt trước)
    //         if (room.players[socket.id]) {
    //             room.players[socket.id].score++;

    //             // Cập nhật bảng điểm cho cả phòng thấy sự thay đổi
    //             io.to(roomID).emit('update_players', Object.values(room.players));

    //             // --- SỰ KIỆN MỚI 2: Gửi lượt mới CHỈ cho người yêu cầu ---
    //             const nextTurn = createTurnData(room.config);
    //             socket.emit('personal_new_turn', nextTurn);
    //         }
    //     }
    // });

    // Thêm sự kiện này vào bên trong io.on('connection', ...)
    socket.on('request_next_turn_timeout', ({ roomID }) => {
        const room = rooms[roomID];
        if (room && room.gameState !== 'ENDED') {
            // Tạo dữ liệu lượt mới dựa trên cấu hình phòng
            const nextTurn = createTurnData(room.config);

            // Chỉ gửi cho đúng người vừa hết thời gian
            // Nếu ở chế độ 'room', có thể cân nhắc gửi cho cả phòng tùy bạn
            if (room.config.turnMode === 'personal') {
                socket.emit('personal_new_turn', nextTurn);
            } else {
                // Ở chế độ room, nếu 1 người hết giờ có thể cho cả phòng qua lượt luôn
                io.to(roomID).emit('new_turn', nextTurn);
            }
        }
    });

    // Sự kiện quan trọng: Hoàn thành lượt cá nhân
    socket.on('submit_win', ({ roomID }) => {
        const room = rooms[roomID];
        if (!room || room.gameState === 'ENDED') return;

        const player = room.players[socket.id];
        if (player) {
            player.score++;
            io.to(roomID).emit('update_players', Object.values(room.players));

            // KIỂM TRA CHẾ ĐỘ CHƠI
            if (room.config.turnMode === 'personal') {
                // Chế độ cá nhân: Chỉ gửi cho người thắng
                const nextTurn = createTurnData(room.config);
                socket.emit('personal_new_turn', nextTurn);
            } else {
                // Chế độ phòng: Đổi lượt cho TẤT CẢ mọi người
                const nextCommonTurn = createTurnData(room.config);
                io.to(roomID).emit('new_turn', nextCommonTurn);
            }
        }
    });

    // Sự kiện cưỡng bức kết thúc ván (nếu Client đếm ngược tổng thời gian xong trước)
    socket.on('force_end_game', ({ roomID }) => {
        const room = rooms[roomID];
        if (room) {
            if (room.gameTimeout) clearTimeout(room.gameTimeout);
            io.to(roomID).emit('game_over', Object.values(room.players));
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

server.listen(port, () => console.log("Server running on port " + port));