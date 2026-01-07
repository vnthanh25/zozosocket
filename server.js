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
    const maxGameTime = parseInt(config.maxGameTime) || 60;
    const timePerTurn = (parseFloat(config.timePerTurn) || 5) * 1000;
    let targetCount = parseInt(config.targetCount) || 1; // Lấy từ Client
    let poolSize = parseInt(config.poolSize) || 12; // Lấy từ Client
    let gridSize = parseInt(config.gridSize) || 12;      // Lấy từ Client

    if (poolSize > 12) poolSize = 12;
    if (targetCount * 2 > poolSize) targetCount = Math.floor(poolSize / 2);
    if (gridSize < targetCount * 2) gridSize = targetCount * 2;

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
        maxTurns,
        maxGameTime,
        timePerTurn: timePerTurn,
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

    // Hàm hỗ trợ gửi lượt mới và kiểm tra maxTurns
    const sendNewTurn = (roomID) => {
        const room = rooms[roomID];
        if (!room) return;

        room.currentTurn++;
        const maxTurns = parseInt(room.config.maxTurns) || 5;

        // KIỂM TRA ĐIỀU KIỆN HẾT LƯỢT (maxTurns)
        if (room.currentTurn > maxTurns) {
            handleGameOver(roomID);
            return;
        }

        // Reset điểm và số lượt cho từng người
        Object.keys(room.players).forEach(id => {
            room.players[id].score = 0;
            if (room.currentTurn === 1) room.players[id].turnsCompleted = 0;
        });

        io.to(roomID).emit('update_players', Object.values(room.players));

        // Phát lượt đầu tiên cho mọi người
        if (room.config.turnMode === 'personal') {
            Object.keys(room.players).forEach(playerId => {
                const turnData = createTurnData(room.config);
                io.to(playerId).emit('personal_new_turn', {
                    ...turnData,
                    currentTurn: room.currentTurn,
                });
            });
        } else {
            // Chế độ Room: Phát chung một lượt cho cả phòng
            const commonTurn = createTurnData(room.config);
            io.to(roomID).emit('new_turn', {
                ...commonTurn,
                currentTurn: room.currentTurn,
            });
        }
    };

    const handleGameOver = (roomID) => {
        const room = rooms[roomID];
        if (room) {
            if (room.timer) clearInterval(room.timer);
            if (room.gameTimeout) clearTimeout(room.gameTimeout);
            io.to(roomID).emit('game_over', Object.values(room.players));
            room.gameState = 'ENDED';
        }
    };

    socket.on('start_game', ({ roomID, config }) => {
        const room = rooms[roomID];
        if (!room) return;

        // 1. Ép kiểu và giá trị mặc định an toàn
        const maxTurns = parseInt(config.maxTurns) || 5;
        const maxGameTime = parseInt(config.maxGameTime) || 60;
        const timePerTurn = parseFloat(config.timePerTurn) || 5;

        // Sử dụng Nullish Coalescing để tránh việc false bị biến thành true
        const useVoice = config.useVoice ?? true;

        let targetCount = parseInt(config.targetCount) || 1;
        let poolSize = parseInt(config.poolSize) || 12;
        let gridSize = parseInt(config.gridSize) || 12;

        // 2. Ràng buộc logic (Constraint)
        if (poolSize > 12) poolSize = 12;
        // Đảm bảo targetCount không bao giờ vượt quá số lượng loài có sẵn
        if (targetCount * 2 > poolSize) targetCount = Math.floor(poolSize / 2);
        // Ngăn gridSize quá nhỏ hoặc quá lớn gây lag
        if (gridSize < targetCount * 2) gridSize = targetCount * 2;
        if (gridSize > 24) gridSize = 24;

        // Khởi tạo biến đếm lượt
        room.currentTurn = 0;

        // 3. Cập nhật và Đồng bộ
        const newConfig = {
            ...room.config, // Giữ lại các config khác nếu có
            maxTurns,
            maxGameTime,
            timePerTurn,
            targetCount,
            poolSize,
            gridSize,
            turnMode: config.turnMode || 'personal',
            useVoice
        };

        room.config = newConfig; // Lưu cấu hình (bao gồm turnMode: 'personal' hoặc 'room')

        // Gửi cho tất cả mọi người trong phòng
        io.to(roomID).emit('update_config', room.config);

        // Lưu trạng thái vào room object
        room.gameState = 'PLAYING';

        sendNewTurn(roomID);

        let timer = null;
        if (newConfig.turnMode === 'room') {
            timer = setInterval(() => {
                room.currentTurn++;
                if (room.currentTurn > maxTurns) {
                    handleGameOver(roomID);
                } else {
                    // Chế độ phòng: Đổi lượt cho TẤT CẢ mọi người
                    const nextCommonTurn = createTurnData(room.config);
                    io.to(roomID).emit('new_turn', {
                        ...nextCommonTurn,
                        currentTurn: room.currentTurn,
                    });
                }
            }, timePerTurn * 1000);
            room.timer = timer;
        }

        // 1. Quản lý TỔNG THỜI GIAN (maxGameTime)
        if (room.gameTimeout) clearTimeout(room.gameTimeout);
        room.gameTimeout = setTimeout(() => {
            handleGameOver(roomID);
        }, maxGameTime * 1000);
    });

    // Thêm sự kiện này vào bên trong io.on('connection', ...)
    socket.on('request_next_turn_timeout', ({ roomID }) => {
        const room = rooms[roomID];
        if (room && room.gameState !== 'ENDED') {
            // Tạo dữ liệu lượt mới dựa trên cấu hình phòng
            const nextTurn = createTurnData(room.config);

            const maxTurns = parseInt(room.config.maxTurns);
            // Chỉ gửi cho đúng người vừa hết thời gian
            // Nếu ở chế độ 'room', có thể cân nhắc gửi cho cả phòng tùy bạn
            if (room.config.turnMode === 'personal') {
                const player = room?.players[socket.id];
                if (player && room.gameState === 'PLAYING') {
                    player.turnsCompleted++; // Vẫn tính là đã qua 1 lượt

                    if (player.turnsCompleted >= maxTurns) {
                        socket.emit('personal_game_finished');
                    } else {
                        const nextTurn = createTurnData(room.config);
                        socket.emit('personal_new_turn', {
                            ...nextTurn,
                            currentTurn: player.turnsCompleted + 1,
                        });
                    }
                }
            } else {
                if (room.currentTurn > maxTurns) {
                    handleGameOver(roomID);
                } else {
                    // // Ở chế độ room, nếu 1 người hết giờ có thể cho cả phòng qua lượt luôn
                    // io.to(roomID).emit('new_turn', {
                    //     ...nextTurn,
                    //     currentTurn: room.currentTurn,
                    // });
                }
            }
        }
    });

    // Sự kiện quan trọng: Hoàn thành lượt cá nhân
    socket.on('submit_win', ({ roomID }) => {
        const room = rooms[roomID];
        if (!room || room.gameState === 'ENDED') return;

        const player = room.players[socket.id];
        if (player) {
            const targets = Array.isArray(room.target) ? room.target : [room.target];
            player.score += targets.length;

            const maxTurns = parseInt(room.config.maxTurns);
            // KIỂM TRA CHẾ ĐỘ CHƠI
            if (room.config.turnMode === 'personal') {
                player.turnsCompleted++; // Tăng số lượt của riêng người này

                if (player.turnsCompleted >= maxTurns) {
                    // Người này đã xong phần của mình
                    socket.emit('personal_game_finished', { score: player.score });

                    // Kiểm tra xem tất cả mọi người đã xong hết chưa?
                    const allFinished = Object.values(room.players).every(p => p.turnsCompleted >= maxTurns);
                    if (allFinished) {
                        handleGameOver(roomID);
                    }
                } else {
                    // Gửi lượt tiếp theo cho riêng người này
                    const nextTurn = createTurnData(room.config);
                    socket.emit('personal_new_turn', {
                        ...nextTurn,
                        currentTurn: player.turnsCompleted + 1,
                    });
                }
            } else {
                if (room.currentTurn > maxTurns) {
                    handleGameOver(roomID);
                }
            }

            io.to(roomID).emit('update_players', Object.values(room.players));
        }
    });

    socket.on('submit_wrong222', ({ roomID }) => {
        const room = rooms[roomID];
        if (room && room.players && room.players[socket.id]) {
            // 1. Tính toán điểm mới
            const currentScore = room.players[socket.id].score || 0;
            const newScore = currentScore - 1;

            // 2. Cập nhật vào room (Mutation)
            room.players[socket.id].score = newScore;

            // 3. QUAN TRỌNG: Tạo một bản sao hoàn toàn mới của Object players để gửi đi
            // Điều này đảm bảo React ở Client nhận thấy sự thay đổi địa chỉ vùng nhớ
            const playersSnapshot = JSON.parse(JSON.stringify(room.players));

            console.log(`Player ${socket.id} sai, điểm mới: ${newScore}`);
            io.to(roomID).emit('update_scores', Object.values(playersSnapshot));
        }
    });

    socket.on('submit_wrong', ({ roomID }) => {
        const room = rooms[roomID];
        if (room && room.players[socket.id]) {
            // Trừ 10 điểm, tối thiểu là 0
            // room.players[socket.id].score = Math.max(0, (room.players[socket.id].score || 0) - 1);

            const currentPlayer = room.players[socket.id];
            currentPlayer.score = currentPlayer.score - 1;

            // // Cập nhật lại cho cả phòng thấy bảng điểm mới
            // io.to(roomID).emit('update_scores', Object.values(room.players));
            // socket.emit('update_score', { score: currentPlayer.score });

            io.to(roomID).emit('update_players', Object.values(room.players));
        }
    });

    // Server side
    socket.on('select_animal', ({ roomID, instanceId }) => {
        const room = rooms[roomID];
        if (!room || room.gameState !== 'PLAYING') return;

        const animal = room.animals.find(a => a.instanceId === instanceId);
        const targets = Array.isArray(room.target) ? room.target : [room.target];

        // Kiểm tra xem con vật này có nằm trong danh sách mục tiêu không
        const isCorrect = targets.some(t => t.id === animal.id || t.name === animal.name);

        if (isCorrect) {
            room.players[socket.id].score = room.players[socket.id].score + 1;
        } else {
            room.players[socket.id].score = room.players[socket.id].score - 1;
        }
    });

    // Server side
    socket.on('select_animal111', ({ roomID, instanceId }) => {
        const room = rooms[roomID];
        if (!room || room.gameState !== 'PLAYING') return;

        const animal = room.animals.find(a => a.instanceId === instanceId);
        const targets = Array.isArray(room.target) ? room.target : [room.target];

        // Kiểm tra xem con vật này có nằm trong danh sách mục tiêu không
        const isCorrect = targets.some(t => t.id === animal.id || t.name === animal.name);

        if (!isCorrect) {
            // --- LOGIC TRỪ ĐIỂM ---
            const penalty = 10; // Số điểm trừ
            room.players[socket.id].score = Math.max(0, (room.players[socket.id].score || 0) - penalty);

            // Gửi thông báo sai cho riêng người chơi này hoặc cả phòng
            socket.emit('wrong_answer', {
                instanceId,
                penalty,
                newScore: room.players[socket.id].score
            });

            // Cập nhật bảng điểm cho cả phòng
            io.to(roomID).emit('update_scores', room.players);
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