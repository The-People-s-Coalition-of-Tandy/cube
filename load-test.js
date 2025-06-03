const WebSocket = require('ws');

class LoadTester {
    constructor(options = {}) {
        this.serverUrl = options.serverUrl || 'ws://localhost:3001';
        this.maxConnections = options.maxConnections || 100;
        this.messageInterval = options.messageInterval || 200; // ms
        this.rampUpTime = options.rampUpTime || 10000; // ms
        this.testDuration = options.testDuration || 60000; // ms
        
        this.connections = [];
        this.stats = {
            connected: 0,
            disconnected: 0,
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0,
            startTime: null,
            endTime: null
        };
        
        this.isRunning = false;
    }
    
    createConnection(id) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.serverUrl);
            const connection = {
                id: id,
                ws: ws,
                position: [Math.random() * 10 - 5, Math.random() * 3, Math.random() * 10 - 5],
                messageInterval: null,
                connected: false
            };
            
            ws.on('open', () => {
                connection.connected = true;
                this.stats.connected++;
                console.log(`Connection ${id} established`);
                
                // Start sending position updates
                connection.messageInterval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN && this.isRunning) {
                        // Random walk
                        connection.position[0] += (Math.random() - 0.5) * 0.2;
                        connection.position[1] += (Math.random() - 0.5) * 0.1;
                        connection.position[2] += (Math.random() - 0.5) * 0.2;
                        
                        ws.send(JSON.stringify({
                            type: 'position_update',
                            position: connection.position
                        }));
                        this.stats.messagesSent++;
                    }
                }, this.messageInterval + Math.random() * 100);
                
                resolve(connection);
            });
            
            ws.on('message', (data) => {
                this.stats.messagesReceived++;
            });
            
            ws.on('error', (error) => {
                this.stats.errors++;
                console.error(`Connection ${id} error:`, error.message);
                reject(error);
            });
            
            ws.on('close', () => {
                if (connection.connected) {
                    this.stats.disconnected++;
                    connection.connected = false;
                }
                if (connection.messageInterval) {
                    clearInterval(connection.messageInterval);
                }
                console.log(`Connection ${id} closed`);
            });
            
            this.connections.push(connection);
        });
    }
    
    async start() {
        console.log(`Starting load test with ${this.maxConnections} connections`);
        console.log(`Ramp-up time: ${this.rampUpTime}ms`);
        console.log(`Test duration: ${this.testDuration}ms`);
        console.log(`Message interval: ${this.messageInterval}ms`);
        
        this.isRunning = true;
        this.stats.startTime = Date.now();
        
        // Ramp up connections gradually
        const connectionDelay = this.rampUpTime / this.maxConnections;
        
        for (let i = 0; i < this.maxConnections; i++) {
            setTimeout(async () => {
                try {
                    await this.createConnection(i + 1);
                } catch (error) {
                    console.error(`Failed to create connection ${i + 1}:`, error.message);
                }
            }, i * connectionDelay);
        }
        
        // Print stats periodically
        const statsInterval = setInterval(() => {
            this.printStats();
        }, 5000);
        
        // Stop test after duration
        setTimeout(() => {
            this.stop();
            clearInterval(statsInterval);
        }, this.testDuration);
    }
    
    stop() {
        console.log('\nStopping load test...');
        this.isRunning = false;
        this.stats.endTime = Date.now();
        
        this.connections.forEach(connection => {
            if (connection.messageInterval) {
                clearInterval(connection.messageInterval);
            }
            if (connection.ws.readyState === WebSocket.OPEN) {
                connection.ws.close();
            }
        });
        
        setTimeout(() => {
            this.printFinalStats();
        }, 2000);
    }
    
    printStats() {
        const elapsed = Date.now() - this.stats.startTime;
        const messagesPerSecond = Math.round(this.stats.messagesSent / (elapsed / 1000));
        
        console.log('\n--- Load Test Stats ---');
        console.log(`Elapsed: ${Math.round(elapsed / 1000)}s`);
        console.log(`Connected: ${this.stats.connected}`);
        console.log(`Disconnected: ${this.stats.disconnected}`);
        console.log(`Messages Sent: ${this.stats.messagesSent}`);
        console.log(`Messages Received: ${this.stats.messagesReceived}`);
        console.log(`Errors: ${this.stats.errors}`);
        console.log(`Messages/sec: ${messagesPerSecond}`);
        console.log('----------------------');
    }
    
    printFinalStats() {
        const totalTime = this.stats.endTime - this.stats.startTime;
        const avgMessagesPerSecond = Math.round(this.stats.messagesSent / (totalTime / 1000));
        
        console.log('\n=== FINAL LOAD TEST RESULTS ===');
        console.log(`Total Duration: ${Math.round(totalTime / 1000)}s`);
        console.log(`Max Connections: ${this.maxConnections}`);
        console.log(`Successful Connections: ${this.stats.connected}`);
        console.log(`Failed Connections: ${this.maxConnections - this.stats.connected}`);
        console.log(`Total Messages Sent: ${this.stats.messagesSent}`);
        console.log(`Total Messages Received: ${this.stats.messagesReceived}`);
        console.log(`Total Errors: ${this.stats.errors}`);
        console.log(`Average Messages/sec: ${avgMessagesPerSecond}`);
        console.log(`Success Rate: ${Math.round((this.stats.connected / this.maxConnections) * 100)}%`);
        console.log('===============================\n');
        
        process.exit(0);
    }
}

// Command line usage
const args = process.argv.slice(2);
const options = {};

// Parse command line arguments
for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    
    switch (key) {
        case 'connections':
            options.maxConnections = parseInt(value);
            break;
        case 'duration':
            options.testDuration = parseInt(value) * 1000;
            break;
        case 'interval':
            options.messageInterval = parseInt(value);
            break;
        case 'rampup':
            options.rampUpTime = parseInt(value) * 1000;
            break;
        case 'url':
            options.serverUrl = value;
            break;
    }
}

// Start the load test
const tester = new LoadTester(options);
tester.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, stopping test...');
    tester.stop();
});

console.log('\nUsage: node load-test.js [options]');
console.log('Options:');
console.log('  --connections <num>   Number of concurrent connections (default: 100)');
console.log('  --duration <seconds>  Test duration in seconds (default: 60)');
console.log('  --interval <ms>       Message interval in milliseconds (default: 200)');
console.log('  --rampup <seconds>    Ramp-up time in seconds (default: 10)');
console.log('  --url <url>           WebSocket server URL (default: ws://localhost:3001)');
console.log('\nExample: node load-test.js --connections 50 --duration 30 --interval 100\n'); 