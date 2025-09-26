// server.js (Local Storage with CSV Import)
// This version saves all data locally and can import CSV files.

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const xlsx = require('xlsx'); // This library can also read CSV files

const app = express();
const PORT = 8080;

const DB_FILE = './attendance_logs.json';

app.use(cors());
app.use(bodyParser.text({ type: '*/*' }));

// Helper function to read/write from the local JSON file
function saveRecords(recordsToSave) {
    fs.readFile(DB_FILE, 'utf8', (err, data) => {
        let allRecords = [];
        if (!err && data) {
            try {
                allRecords = JSON.parse(data);
            } catch (parseErr) {
                console.error('Error parsing existing JSON data, starting fresh.', parseErr);
                allRecords = [];
            }
        }
        // Prepend new records so the newest data is at the top of the JSON file
        const updatedRecords = [...recordsToSave, ...allRecords];
        fs.writeFile(DB_FILE, JSON.stringify(updatedRecords, null, 2), (writeErr) => {
            if (writeErr) {
                console.error('Error saving data to local file:', writeErr);
            } else {
                console.log(`${recordsToSave.length} new record(s) processed and saved locally.`);
            }
        });
    });
}

// Endpoint for the biometric device to push live attendance data
app.post('/iclock/cdata', async (req, res) => {
    console.log('=================================================');
    console.log(`[Data Received] Live attendance data POSTed at ${new Date().toISOString()}`);
    console.log('=================================================\n');

    const rawData = req.body;
    const lines = rawData.split('\n').filter(line => line.trim() !== '');

    const recordsToSave = lines.map(line => {
        const parts = line.split('\t');
        if (parts.length < 2) return null;
        return {
            UserID: parts[0].trim(),
            Timestamp: new Date(parts[1].trim()),
            Source: 'BiometricDevice',
            ReceivedAt: new Date()
        };
    }).filter(record => record !== null);

    if (recordsToSave.length > 0) {
        saveRecords(recordsToSave);
    }
    
    res.status(200).send('OK');
});

// Endpoint to upload data from the local CSV file
app.get('/upload-from-excel', async (req, res) => {
    // --- UPDATED: Now looks for a .csv file ---
    const filePath = './Attendance_Logs.csv';
    console.log(`[CSV Upload] Received request to upload data from ${filePath}`);

    try {
        if (!fs.existsSync(filePath)) {
            const msg = `Error: CSV file not found. Ensure '${filePath}' is in the server's folder.`;
            console.error(msg);
            return res.status(404).send(msg);
        }

        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { cellDates: true, defval: '' });

        if (data.length === 0) {
            return res.status(400).send('CSV file is empty.');
        }

        const recordsToSave = data.map(row => {
            const record = {
                Source: 'ExcelUpload',
                ReceivedAt: new Date()
            };
            
            for (const key in row) {
                const cleanKey = key.trim();
                record[cleanKey] = row[key];
            }

            if (record.Timestamp && !(record.Timestamp instanceof Date)) {
                record.Timestamp = new Date(record.Timestamp);
            }

            return record;
        });

        if (recordsToSave.length > 0) {
            saveRecords(recordsToSave);
            const msg = `Successfully processed ${recordsToSave.length} records from CSV and saved locally.`;
            console.log(`[CSV Upload] ${msg}`);
            res.status(200).send(msg);
        } else {
            res.status(400).send('No valid records found in the CSV file.');
        }
    } catch (error) {
        console.error('[CSV Upload] An error occurred during the upload process:', error);
        res.status(500).send('An internal server error occurred.');
    }
});

// Endpoint for the frontend to fetch the locally stored data
app.get('/get-attendance-data', (req, res) => {
    fs.readFile(DB_FILE, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') return res.json([]);
            return res.status(500).send('Error reading data file.');
        }
        try {
            const records = JSON.parse(data || "[]");
            // Sort by timestamp, newest first
            records.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
            res.json(records);
        } catch (parseErr) {
            res.status(500).send('Error parsing data file.');
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Local Uploader server is running on port ${PORT}`);
    console.log('Waiting for data from the biometric device...');
    console.log(`To upload from Excel, visit http://localhost:${PORT}/upload-from-excel in your browser.`);
});

