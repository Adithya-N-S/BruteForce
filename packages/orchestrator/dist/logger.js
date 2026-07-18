export class Logger {
    name;
    constructor(name) {
        this.name = name;
    }
    log(level, message, context) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            context: {
                ...(this.name ? { logger: this.name } : {}),
                ...context,
            },
        };
        const stream = level === 'error' ? process.stderr : process.stdout;
        stream.write(JSON.stringify(entry) + '\n');
    }
    debug(message, context) {
        this.log('debug', message, context);
    }
    info(message, context) {
        this.log('info', message, context);
    }
    warn(message, context) {
        this.log('warn', message, context);
    }
    error(message, context) {
        this.log('error', message, context);
    }
}
