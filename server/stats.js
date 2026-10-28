const { viewers } = require('./viewers');

// Performance monitoring
const stats = {
    connectionsTotal: 0,
    disconnectionsTotal: 0,
    messagesReceived: 0,
    messagesSent: 0,
    errors: 0,
    startTime: Date.now(),
    peakConnections: 0
};

function logStats() {
    const uptime = Math.round((Date.now() - stats.startTime) / 1000);
    const currentConnections = viewers.size;
    const memUsage = process.memoryUsage();

    console.log('\n=== SERVER STATS ===');
    console.log(`Uptime: ${uptime}s`);
    console.log(`Current Connections: ${currentConnections}`);
    console.log(`Peak Connections: ${stats.peakConnections}`);
    console.log(`Total Connections: ${stats.connectionsTotal}`);
    console.log(`Total Disconnections: ${stats.disconnectionsTotal}`);
    console.log(`Messages Received: ${stats.messagesReceived}`);
    console.log(`Messages Sent: ${stats.messagesSent}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Memory Usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`Messages/sec: ${Math.round(stats.messagesReceived / uptime)}`);
    console.log('==================\n');
}

// Log stats every 10 seconds
function startStatsLogging() {
    setInterval(logStats, 10000);
}

module.exports = { stats, startStatsLogging };
