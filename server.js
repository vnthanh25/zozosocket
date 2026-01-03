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
        const timeMs = (parseFloat(config.timePerTurn) || 5) * 1000;
        const targetCount = parseInt(config.targetCount) || 1; // Lấy từ Client
        const poolSize = parseInt(config.poolSize) || 12; // Lấy từ Client
        const gridSize = parseInt(config.gridSize) || 12;      // Lấy từ Client

        if (poolSize > 12) poolSize = 12;
        if (targetCount * 2 > poolSize) targetCount = poolSize / 2;
        if (gridSize < targetCount * 2) gridSize = targetCount * 2

        // Reset điểm cho mọi người trong phòng
        Object.keys(room.players).forEach(id => room.players[id].score = 0);
        io.to(roomID).emit('update_players', Object.values(room.players));

        if (room.gameInterval) clearInterval(room.gameInterval);

        room.gameInterval = setInterval(() => {
            turn++;
            if (turn <= maxTurns) {
                // 1. Tạo lưới dựa trên gridSize từ client
                // Cách tiếp cận "Xáo trộn bộ bài" thay vì bốc ngẫu nhiên từng con
                // const animals = Array.from({ length: gridSize }, (_, i) => {
                //     // Lấy con vật theo thứ tự i % 12 để đảm bảo các con vật xuất hiện đều nhau
                //     const baseAnimal = ZODIAC_DATA[i % 12];
                //     return {
                //         ...baseAnimal,
                //         instanceId: Math.random().toString(36).substr(2, 9)
                //     };
                // }).sort(() => 0.5 - Math.random()); // Sau đó mới xáo trộn vị trí

                // // 1. Chọn ra 4-5 con vật "may mắn" từ 12 con
                // const luckyAnimals = [...ZODIAC_DATA]
                //     .sort(() => 0.5 - Math.random())
                //     .slice(0, poolSize); // Chỉ lấy một số loại con vật thôi

                // // 2. Tạo lưới chỉ từ những loại con vật này
                // const animals = Array.from({ length: gridSize }, () => {
                //     const randomLucky = luckyAnimals[Math.floor(Math.random() * luckyAnimals.length)];
                //     return {
                //         ...randomLucky,
                //         instanceId: Math.random().toString(36).substr(2, 9)
                //     };
                // });

                // // 1. Trộn toàn bộ 12 con giáp (như xáo bài)
                // const shuffledZodiac = [...ZODIAC_DATA].sort(() => 0.5 - Math.random());

                // let selectedAnimals = [];

                // if (gridSize <= 12) {
                //     // Nếu lưới nhỏ: Lấy X con khác nhau hoàn toàn từ danh sách đã trộn
                //     selectedAnimals = shuffledZodiac.slice(0, gridSize);
                // } else {
                //     // Nếu lưới lớn (ví dụ 18): 
                //     // - Lấy hết 12 con khác nhau trước
                //     // - 6 con còn lại bốc ngẫu nhiên (chấp nhận trùng)
                //     const extraCount = gridSize - 12;
                //     const extras = Array.from({ length: extraCount }, () =>
                //         ZODIAC_DATA[Math.floor(Math.random() * 12)]
                //     );
                //     selectedAnimals = [...ZODIAC_DATA, ...extras];
                // }

                // // 2. Gán instanceId và xáo trộn vị trí cuối cùng để các con trùng không đứng cạnh nhau
                // const animals = selectedAnimals.map(a => ({
                //     ...a,
                //     instanceId: Math.random().toString(36).substr(2, 9)
                // })).sort(() => 0.5 - Math.random());

                // // 1. Bốc ngẫu nhiên X loài từ 12 con giáp (X = poolSize)
                // const selectedSpecies = [...ZODIAC_DATA]
                //     .sort(() => 0.5 - Math.random())
                //     .slice(0, Math.min(poolSize, 12));

                // // 2. Tạo lưới gridSize từ nhóm loài đã chọn ở trên
                // const animals = Array.from({ length: gridSize }, () => {
                //     const randomSpecies = selectedSpecies[Math.floor(Math.random() * selectedSpecies.length)];
                //     return {
                //         ...randomSpecies,
                //         instanceId: Math.random().toString(36).substr(2, 9)
                //     };
                // }).sort(() => 0.5 - Math.random());


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
                


                // 2. Chọn mục tiêu dựa trên targetCount từ client
                // Lấy danh sách icon duy nhất hiện có trên lưới
                const uniqueOnGrid = Array.from(new Set(animals.map(a => a.id)))
                    .map(id => animals.find(a => a.id === id));

                // Xáo trộn và lấy đúng số lượng mục tiêu yêu cầu
                const target = uniqueOnGrid
                    .sort(() => 0.5 - Math.random())
                    .slice(0, Math.min(targetCount, uniqueOnGrid.length));

                io.to(roomID).emit('new_turn', {
                    animals,
                    target,
                    turnCount: turn,
                    timePerTurn: timeMs,
                    maxTurns
                });
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

server.listen(port, () => console.log("Server running on port " + port));