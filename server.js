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
        const { username, roomID, config } = data;

        socket.join(roomID);
        if (!rooms[roomID]) {
            rooms[roomID] = { players: {}, gameInterval: null, createdAt: Date.now() };
        }
        const room = rooms[roomID];

        // 1. Tìm socket.id cũ dựa trên username
        const oldId = Object.keys(room.players).find(
            id => room.players[id].username === username
        );

        if (!oldId) {
            // 2. Tạo mới.
            room.players[socket.id] = { id: socket.id, username, roomID, score: 0, isActive: true };
        } else {
            // 2. Sao chép dữ liệu cũ sang socket.id mới
            room.players[socket.id] = { ...room.players[oldId], id: socket.id, isActive: true };

            // 3. Xóa socket.id cũ
            delete room.players[oldId];

            socket.emit('update_config', room.config);
        }
        if (!room.config) room.config = config;
        io.to(roomID).emit('update_players', Object.values(rooms[roomID].players));
    });
    socket.on('change_config', ({ roomID, config }) => {
        const room = rooms[roomID];
        if (!room) return;
        const player = room.players[socket.id];
        if (!player) return;
        room.config = config;
    });
    socket.on('stt', ({ roomID }) => {
        const room = rooms[roomID];
        if (!room) return;
        const player = room.players[socket.id];
        if (!player) return;
        if (!room.config || !room.config.targetCount) return;
        if (!room.stt || room.stt1 !== socket.id) {
            room.stt = 0;
        }
        room.stt += 1;
        if (room.stt > room.config.targetCount) room.stt = 0;
        room.stt1 = socket.id;
    });

    // // Cấu hình: 24 giờ tính bằng miliseconds
    // const MAX_ROOM_AGE = 24 * 60 * 60 * 1000;

    // const cleanupRooms = () => {
    //     const now = Date.now();
    //     const roomIDs = Object.keys(rooms);
    //     let deletedCount = 0;

    //     roomIDs.forEach(roomID => {
    //         const room = rooms[roomID];

    //         // Kiểm tra nếu phòng tồn tại quá 24h
    //         if (now - room.createdAt > MAX_ROOM_AGE) {

    //             // QUAN TRỌNG: Dừng interval của game nếu đang chạy
    //             if (room.gameInterval) {
    //                 clearInterval(room.gameInterval);
    //             }

    //             // Xóa phòng khỏi object rooms
    //             delete rooms[roomID];
    //             deletedCount++;
    //         }
    //     });

    //     if (deletedCount > 0) {
    //         console.log(`[CLEANUP] Đã xóa ${deletedCount} phòng cũ.`);
    //     }
    // };

    // // Chạy quét dọn mỗi 1 tiếng một lần
    // setInterval(cleanupRooms, 60 * 60 * 1000);

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
        const player = room.players[socket.id];
        if (!player) return;

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
            ...config, // Giữ lại các config khác nếu có
            boss: player.username,
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
        if (!room) return;
        const player = room.players[socket.id];
        if (!player) return;

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
        if (!player) return;

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

    // socket.on('submit_wrong222', ({ roomID }) => {
    //     const room = rooms[roomID];
    //     if (room && room.players && room.players[socket.id]) {
    //         // 1. Tính toán điểm mới
    //         const currentScore = room.players[socket.id].score || 0;
    //         const newScore = currentScore - 1;

    //         // 2. Cập nhật vào room (Mutation)
    //         room.players[socket.id].score = newScore;

    //         // 3. QUAN TRỌNG: Tạo một bản sao hoàn toàn mới của Object players để gửi đi
    //         // Điều này đảm bảo React ở Client nhận thấy sự thay đổi địa chỉ vùng nhớ
    //         const playersSnapshot = JSON.parse(JSON.stringify(room.players));

    //         console.log(`Player ${socket.id} sai, điểm mới: ${newScore}`);
    //         io.to(roomID).emit('update_scores', Object.values(playersSnapshot));
    //     }
    // });

    socket.on('submit_wrong', ({ roomID }) => {
        const room = rooms[roomID];
        if (!room) return;
        const player = room.players[socket.id];
        if (!player) return;

        if (room && room.players[socket.id]) {
            // Trừ 10 điểm, tối thiểu là 0
            // room.players[socket.id].score = Math.max(0, (room.players[socket.id].score || 0) - 1);

            const currentPlayer = room.players[socket.id];
            currentPlayer.score = currentPlayer.score - 1;

            // // Cập nhật lại cho cả phòng thấy bảng điểm mới
            // io.to(roomID).emit('update_scores', Object.values(room.players));
            socket.emit('update_score', { score: currentPlayer.score });
        }
    });

    // Server side
    socket.on('select_animal', ({ roomID, instanceId }) => {
        const room = rooms[roomID];
        if (!room || room.gameState !== 'PLAYING') return;
        const player = room.players[socket.id];
        if (!player) return;

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
        const player = room.players[socket.id];
        if (!player) return;

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
        if (!room) return;
        const player = room.players[socket.id];
        if (!player) return;

        if (room) {
            if (room.gameTimeout) clearTimeout(room.gameTimeout);
            io.to(roomID).emit('game_over', Object.values(room.players));
        }
    });

    socket.on('disconnect', () => {
        // Tìm xem socket này ở phòng nào để xóa
        for (const roomID in rooms) {
            if (rooms[roomID].players[socket.id]) {
                // Set current player is not active.
                rooms[roomID].players[socket.id].isActive = false;
                io.to(roomID).emit('update_players', Object.values(rooms[roomID].players));

                // Xóa phòng nếu không còn ai
                if (Object.keys(rooms[roomID].players).filter(item => item.isActive).length === 0) {
                    if (rooms[roomID].gameInterval) clearInterval(rooms[roomID].gameInterval);
                    delete rooms[roomID];
                }
                break;
            }
        }
    });



    // Hàm tạo dữ liệu lượt chơi (Helper)
    const createSuggestTurnData = (roomID) => {
        const room = rooms[roomID];
        if (!room) return;

        const config = room.config;
        const targetCount = parseInt(config.targetCount) || 3;
        let gridSize = parseInt(config.gridSize) || 6;      // Lấy từ Client

        if (gridSize < targetCount * 2) gridSize = targetCount * 2;


        // 1. Chọn ra danh sách các loài sẽ tham gia ván này
        const selectedSpecies = [...ZODIAC_DATA]
            .sort(() => 0.5 - Math.random())
            .slice(0, Math.min(gridSize, 12));
        // 2. Tạo lưới bằng cách lặp lại các loài trong selectedSpecies cho đến khi đủ gridSize
        let animalsRaw = [];
        for (let i = 0; i < gridSize; i++) {
            // Lấy con vật theo cơ chế xoay vòng (Round-robin)
            const baseAnimal = selectedSpecies[i];
            animalsRaw.push({
                ...baseAnimal,
                instanceId: Math.random().toString(36).substr(2, 9)
            });
        }
        // 3. Xáo trộn toàn bộ lưới để vị trí các con trùng nhau không nằm cạnh nhau một cách máy móc
        const animals = animalsRaw.sort(() => 0.5 - Math.random());

        return {
            currentTurn: room.currentTurn + 1,
            animals,
        };
    };

    const sendNewTurnSuggest = (roomID) => {
        const room = rooms[roomID];
        if (!room) return;

        const newTurn = createSuggestTurnData(roomID);
        io.to(roomID).emit('new_turn_suggest_data', newTurn);

        // Cập room.
        room.currentTurn = newTurn.currentTurn;
        room.animals = newTurn.animals;
        room.gameState = 'SELECTING';
        Object.keys(room.selections).forEach(sid => {
            room.selections[sid] = [];
        });
        // rooms[roomID] = {
        //     ...room,
        //     ...newTurn,
        // }
    }

    socket.on('start_game_suggest', ({ roomID, config }) => {
        const room = rooms[roomID];
        if (!room) return;
        const player = room.players[socket.id];
        if (!player) return;

        let targetCount = parseInt(config.targetCount) || 3;
        let gridSize = parseInt(config.gridSize) || 12;

        // 3. Cập nhật và Đồng bộ
        const newConfig = {
            ...config, // Giữ lại các config khác nếu có
            boss: player.username,
            targetCount,
            gridSize,
        };
        room.config = newConfig; // Lưu cấu hình (bao gồm turnMode: 'personal' hoặc 'room')
        // Gửi cho tất cả mọi người trong phòng
        io.to(roomID).emit('update_config', room.config);

        // Reset điểm và số lượt cho từng người
        Object.keys(room.players).forEach(id => {
            room.players[id].score = 0;
        });
        io.to(roomID).emit('update_players', Object.values(room.players));


        // Phát lượt đầu tiên cho mọi người
        room.currentTurn = 0;
        room.selections = {};
        sendNewTurnSuggest(roomID);
    });

    socket.on('new_turn_suggest', ({ roomID }) => {
        const room = rooms[roomID];
        if (!room) return;
        const player = room.players[socket.id];
        if (!player) return;

        sendNewTurnSuggest(roomID);
    });

    // 1. Khi người chơi chọn hoặc bỏ chọn con vật
    socket.on('toggle_selection', ({ roomID, instanceId }) => {
        const room = rooms[roomID];
        if (!room || room.gameState !== 'SELECTING') return;
        const player = room.players[socket.id];
        if (!player) return;

        if (!room.selections[socket.id]) {
            room.selections[socket.id] = [];
        }

        const index = room.selections[socket.id].indexOf(instanceId);
        if (index > -1) {
            room.selections[socket.id].splice(index, 1); // Bỏ chọn
        } else {
            // Giới hạn chọn tối đa 3 con (ví dụ)
            if (room.selections[socket.id].length < room.config.gridSize) {
                room.selections[socket.id].push(instanceId);
            }
        }

        // Gửi cập nhật riêng cho người chơi đó để đồng bộ
        socket.emit('your_selections_updated', room.selections[socket.id]);
    });

    // 2. Khi Host nhấn Confirm
    socket.on('host_confirm_reveal', ({ roomID }) => {
        const room = rooms[roomID];
        if (!room || room.gameState !== 'SELECTING') return;
        const player = room.players[socket.id];
        if (!player) return;

        let rAnimals = room.animals;
        let targets = [];
        let targetCount = room.config.targetCount;
        const isStt = room.stt && room.stt > 0;
        if (isStt) {
            // const size = Math.floor(Math.random() * Math.ceil(targetCount / 1));
            const size = targetCount;
            if (size > 0) {
                if (room.config.boss !== player.username) {
                    const picks = room.selections[room.stt1];
                    let indexs = [];
                    for (let index = 0; index < size; index++) {
                        indexs.push(true);
                        indexs.push(false);
                        for (let index1 = 0; index1 < room.stt; index1++) {
                            indexs.push(true);
                        }
                    }
                    const pickAs = rAnimals.filter(item => picks.includes(item.instanceId));
                    for (let index = 0; index < size; index++) {
                        const index1 = Math.floor(Math.random() * indexs.length);
                        if (indexs[index1]) {
                            const index2 = Math.floor(Math.random() * pickAs.length);
                            const pickA = pickAs[index2];
                            targets.push(pickA);
                            targetCount--;
                        }
                    }
                } else {
                    let pickIds = [];
                    Object.keys(room.selections).forEach(sid => {
                        const userPicks = room.selections[sid];
                        const userPickIds = rAnimals.filter(item => userPicks.includes(item.instanceId)).map(item => item.id);
                        const vPickIds = userPickIds.filter(id => !pickIds.includes(id));
                        vPickIds.forEach(pickId => pickIds.push(pickId));
                    });
                    let indexs = [];
                    for (let index = 0; index < size; index++) {
                        indexs.push(true);
                        indexs.push(false);
                        for (let index1 = 0; index1 < room.stt; index1++) {
                            indexs.push(true);
                        }
                    }
                    for (let index = 0; index < pickIds.length; index++) {
                        const index1 = Math.floor(Math.random() * indexs.length);
                        if (!indexs[index1]) {
                            delete pickIds[index];
                        }
                    }
                    rAnimals = rAnimals.filter(item => !pickIds.includes(item.id));
                }
            }
        }

        for (let i = 0; i < targetCount; i++) {
            // Chọn ngẫu nhiên một vị trí bất kỳ trong mảng animals
            const randomIndex = Math.floor(Math.random() * rAnimals.length);
            targets.push(rAnimals[randomIndex]);
        }

        room.target = targets;
        room.gameState = 'REVEALED';

        // Tính toán điểm cho tất cả người chơi
        Object.keys(room.selections).forEach(sid => {
            const userPicks = room.selections[sid];
            const userPickIds = room.animals.filter(item => userPicks.includes(item.instanceId)).map(item => item.id);
            let pointsEarned = 0;
            userPickIds.forEach(pickId => {
                const count = targets.filter(item => item.id === pickId).length;
                if (count < 1) pointsEarned--
                else pointsEarned += count;
            });

            room.players[sid].score = (room.players[sid].score || 0) + pointsEarned;
        });

        // Thông báo kết quả cho cả phòng
        io.to(roomID).emit('results_revealed', {
            targets: targets,
            allSelections: room.selections,
            updatedPlayers: Object.values(room.players)
        });
    });

});

server.listen(port, () => console.log("Server running on port " + port));