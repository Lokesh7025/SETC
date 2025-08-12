
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


app.post('/iclock/cdata', (req, res) => {
  
    console.log('=================================================');
    console.log('RAW DATA RECEIVED AT:', new Date().toISOString());
    console.log('-------------------------------------------------');
  
    console.log(req.body);
    console.log('-------------------------------------------------');
    console.log('END OF RAW DATA');
    console.log('=================================================\n');
  


    const rawDataForLog = `\n--- Log Entry: ${new Date().toISOString()} ---\n${req.body}\n`;
    fs.appendFile(RAW_LOG_FILE, rawDataForLog, (err) => {
        if (err) console.error('Failed to write to raw log file:', err);
    });

   
    const rawData = req.body;
    const lines = rawData.split('\n').filter(line => line.trim() !== '');

    
    const newRecords = lines.map(line => {
       
        const parts = line.split('\t');
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

   
    res.status(200).send('OK');
});

app.get('/get-attendance-data', (req, res) => {
    fs.readFile(DB_FILE, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') return res.json([]);
            console.error('Error reading database file:', err);
            return res.status(500).send('Error reading data.');
        }
        try {
            const records = JSON.parse(data);
            records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            res.json(records);
        } catch (parseErr) {
            console.error('Error parsing JSON data:', parseErr);
            res.status(500).send('Error parsing data.');
        }
    });
});

function saveRecords(recordsToSave) {
    fs.readFile(DB_FILE, 'utf8', (err, data) => {
        let allRecords = [];
        if (!err && data) {
            try {
                allRecords = JSON.parse(data);
            } catch (parseErr) {
                console.error('Could not parse existing DB file, starting fresh.', parseErr);
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

// 8. Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server is running on port ${PORT}`);
    console.log('Waiting for data from the biometric device...');
});
