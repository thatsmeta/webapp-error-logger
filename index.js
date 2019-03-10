/**
 * TODO
 *   better error handling
 *   define format for logging server (multiline string?) logstash
 *   deployment via docker (add webapp upon build)
 */
const express = require('express');
const glob = require('glob');
const logger = require('./logger');
const config = require('./config')[process.env.NODE_ENV];

const port = config.port;
const webAppDir = config.webAppDir;
const webAppUrl = config.webAppUrl;

const sourceMapFileExtension = '.js.map';
const sourceMapSuffix = '.map';
const fileEncoding = 'utf8';

logger.info('initializing webapp error logger');
const sourceMapFileNames = glob.sync(`${webAppDir}**/*${sourceMapFileExtension}`, {});
logger.info('found the following source maps:\n', sourceMapFileNames);

let gps;
initializeStacktraceGps(sourceMapFileNames);

const app = express();
app.use(express.json());

app.post('/', function (request, result) {
    const requestBody = request.body;
    const trimmedErrorMessage = trimErrorMessage(requestBody.message);
    decodeStackFrames(requestBody.stack).then(stackFrameStrings => {
        sendToLoggingServer(trimmedErrorMessage, stackFrameStrings);
    });
    result.send('Thank you for reporting an error.');
});

app.listen(port, function () {
    logger.info('browser error logger listening on port %d!', port);
});

function initializeStacktraceGps(sourceMapFilenames) {
    logger.info('reading source map files');

    const fileSystem = require('fs');
    const StackTraceGPS = require('stacktrace-gps');
    const SourceMap = require("source-map");

    const sourceCache = {};
    const sourceMapConsumerCache = {};

    sourceMapFilenames.forEach(sourceMapPath => {

        const sourceMapFile = fileSystem.readFileSync(sourceMapPath, fileEncoding);

        let jsFilePath = sourceMapPath.substr(0, sourceMapPath.length - sourceMapSuffix.length);
        if (!fileSystem.existsSync(jsFilePath)) {
            logger.warn('source map but no original file found for %s', sourceMapPath);
            return;
        }
        const jsFile = fileSystem.readFileSync(jsFilePath, fileEncoding);

        const sourceMapPathOnServer = sourceMapPath.substr(sourceMapPath.indexOf(webAppDir) + webAppDir.length, sourceMapPath.length);
        const jsFilePathOnServer = jsFilePath.substr(jsFilePath.indexOf(webAppDir) + webAppDir.length, jsFilePath.length);

        sourceCache[webAppUrl + jsFilePathOnServer] = jsFile;

        sourceMapConsumerCache[webAppUrl + sourceMapPathOnServer] = new SourceMap.SourceMapConsumer(sourceMapFile);
    });

    logger.info('reading source map files finished');
    logger.info('initializing stacktrace-gps');
    gps = new StackTraceGPS({
        offline: true,
        sourceCache: sourceCache,
        sourceMapConsumerCache: sourceMapConsumerCache
    });
}

function trimErrorMessage(errorMessage) {
    const indexOfLineBreak = errorMessage.indexOf('\n');
    let indexToCutOffErrorMessage;
    if (indexOfLineBreak > 0) {
        indexToCutOffErrorMessage = indexOfLineBreak;
    } else {
        indexToCutOffErrorMessage = errorMessage.length;
    }
    return errorMessage.substr(0, indexToCutOffErrorMessage);
}

async function decodeStackFrames(stackFrameArray) {
    logger.info('decoding stacktrace');
    const stackPromises = stackFrameArray.map(uglifiedStackFrame => gps.pinpoint(uglifiedStackFrame));
    const results = await Promise.all(stackPromises.map(promise => promise.catch(error => error)));
    const decodedStackFrames = results.filter(result => !(result instanceof Error));
    return decodedStackFrames.map(stackFrame => stackFrame.toString());
}

function sendToLoggingServer(trimmedErrorMessage, stackFrameStrings) {
    const loggingString = [trimmedErrorMessage, ...stackFrameStrings].join('\n  ');
    logger.info('sending error to logging server');
    logger.error(loggingString);
}
