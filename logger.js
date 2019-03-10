const {createLogger, format, transports} = require('winston');
const config = require('./config')[process.env.NODE_ENV];

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        format.errors({stack: true}),
        format.splat(),
        format.json()
    ),
    defaultMeta: {service: 'webapp-error-logger'},
    transports: [
        new transports.File({
            filename: `${config.logFileDir}error.log`,
            level: 'error'
        }),
        new transports.File({filename: `${config.logFileDir}combined.log`})
    ],
    exceptionHandlers: [
        new transports.File({filename: `${config.logFileDir}exception.log`})
    ],
});

if (process.env.NODE_ENV !== 'prod') {
    logger.add(new transports.Console({
        format: format.combine(
            format.colorize(),
            format.simple()
        ),
        handleExceptions: true
    }));
}

module.exports = logger;
