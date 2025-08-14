// server.js (Active Handshake Version)
// This version adds specific routes to handle device registration "handshakes".

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const PORT = 80;

const DB_FILE = './attendance_logs.json';
const RAW_LOG_FILE = './raw_data_logs.txt';

app.use(cors());
app.use(bodyParser.text({ type: '*/*' }));

// --- NEW: Device Registration Handlers ---
// Many devices first send a GET request with their serial number to "register".
// We need to catch this and respond with "OK" to let the device know we are a valid server.
app.get('/iclock/cdata', (req, res) => {
    console.log('=================================================');
    console.log(`[Handshake] Device sent info via GET request at ${new Date().toISOString()}`);
    console.log(`Device Serial Number (from query): ${req.query.SN}`);
    console.log('Responding with "OK" to complete handshake.');
    console.log('=================================================\n');
    
    // The device expects a simple "OK" to confirm the server is alive.
    res.status(200).send('OK');
});

// Some device firmwares might use a different path for the initial check-in.
app.get('/iclock/device', (req, res) => {
    console.log('=================================================');
    console.log(`[Handshake] Device is checking in at /iclock/device at ${new Date().toISOString()}`);
    console.log('Responding with "OK".');
    console.log('=================================================\n');
    res.status(200).send('OK');
});

// This is the main endpoint where the device will POST the actual attendance data
// AFTER it has successfully completed the handshake.
app.post('/iclock/cdata', (req, res) => {
    console.log('=================================================');
    console.log(`[Data Received] Attendance data POSTed at ${new Date().toISOString()}`);
    console.log('-------------------------------------------------');
    console.log('Body/Payload:');
    console.log(req.body);
    console.log('=================================================\n');

    // Save the raw data to a log file for inspection
    const rawDataForLog = `\n--- Log Entry: ${new Date().toISOString()} ---\n${req.body}\n`;
    fs.appendFile(RAW_LOG_FILE, rawDataForLog, (err) => {
        if (err) console.error('Failed to write to raw log file:', err);
    });

    // Process the attendance records
    const rawData = req.body;
    const lines = rawData.split('\n').filter(line => line.trim() !== '');

    const newRecords = lines.map(line => {
        const parts = line.split('\t'); // Assumes tab-separated data
        if (parts.length < 2) {
            console.log(`[Processing Warning] Skipping malformed line: "${line}"`);
            return null;
        }
        return {
            userId: parts[0],
            timestamp: parts[1],
            type: 'attendance',
            receivedAt: new Date().toISOString()
        };
    }).filter(record => record !== null);

    if (newRecords.length > 0) {
        saveRecords(newRecords);
    }
    
    // Respond to the device to acknowledge receipt of the data.
    res.status(200).send('OK');
});

// Endpoint for the frontend to fetch the processed data
app.get('/get-attendance-data', (req, res) => {
    fs.readFile(DB_FILE, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') return res.json([]);
            return res.status(500).send('Error reading data.');
        }
        try {
            const records = JSON.parse(data || "[]");
            records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            res.json(records);
        } catch (parseErr) {
            res.status(500).send('Error parsing data.');
        }
    });
});

// Helper function to save records
function saveRecords(recordsToSave) {
    fs.readFile(DB_FILE, 'utf8', (err, data) => {
        let allRecords = [];
        if (!err && data) {
            try {
                allRecords = JSON.parse(data);
            } catch (parseErr) {
                allRecords = [];
            }
        }
        const updatedRecords = [...allRecords, ...recordsToSave];
        fs.writeFile(DB_FILE, JSON.stringify(updatedRecords, null, 2), (writeErr) => {
            if (writeErr) {
                console.error('Error saving data to file:', writeErr);
            } else {
                console.log(`${recordsToSave.length} new record(s) processed and saved successfully.`);
            }
        });
    });
}

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Active Handshake server is running on port ${PORT}`);
    console.log('Waiting for device handshake or data...');
});
