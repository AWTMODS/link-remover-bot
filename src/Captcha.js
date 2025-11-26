class Captcha {
    constructor() {
        this.store = {}; // { `${chatId}_${userId}`: { answer, expiresAt, tries, welcomeMsgId } }
    }

    generate() {
        const a = Math.floor(Math.random() * 9) + 1;
        const b = Math.floor(Math.random() * 9) + 1;
        const answer = a + b;

        // Generate 3 wrong answers
        const options = new Set([answer]);
        while (options.size < 4) {
            options.add(Math.floor(Math.random() * 18) + 2);
        }

        return {
            question: `What is ${a} + ${b}?`,
            answer: answer,
            options: Array.from(options).sort(() => Math.random() - 0.5) // Shuffle
        };
    }

    create(chatId, userId, welcomeMsgId) {
        const cap = this.generate();
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
