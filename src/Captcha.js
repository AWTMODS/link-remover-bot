class Captcha {
    constructor() {
        this.store = {}; // { `${chatId}_${userId}`: { answer, expiresAt, tries, welcomeMsgId } }
    }

    generate(difficulty = 'easy') {
        const a = Math.floor(Math.random() * 10);
        const b = Math.floor(Math.random() * 10);

        let question, answer;

        if (difficulty === 'hard') {
            // Multiplication for low rep users
            question = `${a} * ${b} = ?`;
            answer = a * b;
        } else {
            // Addition for normal users
            question = `${a} + ${b} = ?`;
            answer = a + b;
        }

        const options = [answer];
        while (options.length < 4) {
            const r = Math.floor(Math.random() * (difficulty === 'hard' ? 100 : 20));
            if (!options.includes(r)) options.push(r);
        }

        // Shuffle
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }

        const id = 'CAPTCHA_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        this.store[id] = { answer, expires: Date.now() + 300000 }; // 5 mins

        return { id, question, options };
    }

    create(chatId, userId, welcomeMsgId, difficulty = 'easy') {
        const cap = this.generate(difficulty);
        const key = `${chatId}_${userId}`;
        this.store[key] = {
            answer: cap.answer,
            expiresAt: Date.now() + 120000,
            tries: 0,
            welcomeMsgId
        };
        return cap;
    }

    get(chatId, userId) {
        return this.store[`${chatId}_${userId}`];
    }

    delete(chatId, userId) {
        delete this.store[`${chatId}_${userId}`];
    }
}

module.exports = Captcha;
