// downloader.js - A script to automate downloading Excel files from a website.
// This uses Puppeteer to control a Chrome browser.
// VERSION: Optimized for speed.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// --- CONFIGURATION ---
const ESSL_LOGIN_URL = 'http://localhost/iclock/Main.aspx';
const USERNAME = 'essl';
const PASSWORD = 'essl'; 
const DOWNLOAD_PATH = __dirname;
const CHROME_PROFILE_PATH = path.join(__dirname, 'ChromeProfile');

// --- OPTIMIZED POLLING FUNCTION ---
// This function will check for the downloaded file every second instead of a long fixed wait.
async function waitForDownload(directory) {
    console.log('Waiting for download to start...');
    const maxWaitTime = 20000; // Max 20 seconds
    const pollInterval = 1000; // Check every 1 second
    let elapsedTime = 0;

    const existingFiles = new Set(fs.readdirSync(directory));

    while (elapsedTime < maxWaitTime) {
        const currentFiles = fs.readdirSync(directory);
        const newFile = currentFiles.find(f => !existingFiles.has(f) && (f.endsWith('.xlsx') || f.endsWith('.xls')));

        if (newFile) {
            console.log(`New file detected: ${newFile}. Download complete.`);
            return newFile; // Return the name of the new file
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
        elapsedTime += pollInterval;
    }

    throw new Error('Download timed out after 20 seconds.');
}


async function downloadAttendanceReport() {
    console.log('Launching browser with a persistent profile...');

    if (!fs.existsSync(DOWNLOAD_PATH)) {
        fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
    }

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        userDataDir: CHROME_PROFILE_PATH,
        args: ['--disable-features=PasswordManager']
    });
    
    const page = await browser.newPage();
    
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: DOWNLOAD_PATH,
    });

    try {
        console.log(`Navigating to ${ESSL_LOGIN_URL}...`);
        await page.goto(ESSL_LOGIN_URL, { waitUntil: 'networkidle2' });

        const isLoggedIn = await page.$('#EasymenuMain');

        if (!isLoggedIn) {
            console.log('Not logged in. Logging in now...');
            let loginFrame = page;
            const iframeElementHandle = await page.$('iframe'); 
            if (iframeElementHandle) {
                const frame = await iframeElementHandle.contentFrame();
                if (frame && await frame.$('#StaffloginDialog_txt_LoginName')) {
                    loginFrame = frame;
                }
            }
            
            await loginFrame.type('#StaffloginDialog_txt_LoginName', USERNAME);
            await loginFrame.type('#StaffloginDialog_Txt_Password', PASSWORD);
            await loginFrame.click('#StaffloginDialog_Btn_Ok');
            await page.waitForSelector('#EasymenuMain', { visible: true });
        }
        
        console.log('Login successful!');
        await new Promise(resolve => setTimeout(resolve, 500)); // Minimal wait for rendering

        // --- NAVIGATE TO THE REPORT PAGE ---
        console.log('Hovering over the "Reports" menu...');
        await page.hover('#Reports');
        
        await page.waitForSelector('#ExportLogs', { visible: true });
        console.log('Hovering over "Export Logs"...');
        await page.hover('#ExportLogs');
        
        await page.waitForSelector('#MenuItem16', { visible: true });
        console.log('Clicking on "Export Attendance Logs"...');
        await page.click('#MenuItem16');

        // --- INTERACT WITH THE REPORT PAGE (INSIDE THE IFRAME) ---
        console.log('Waiting for the report page to load inside the iframe...');
        await page.waitForSelector('iframe#tabIframe');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Reduced wait for iframe content
        const iframeElement = await page.$('iframe#tabIframe');
        const frame = await iframeElement.contentFrame();

        if (!frame) {
            throw new Error('Could not access the iframe content.');
        }

        console.log('Successfully accessed the iframe.');
        
        // --- CLICK THE EXPORT BUTTON ---
        const exportButtonSelector = '#ReportProtoType_btn_GenerateReport';
        
        console.log(`Waiting for the export button: "${exportButtonSelector}"`);
        await frame.waitForSelector(exportButtonSelector, { visible: true });
        
        console.log('Clicking the "Generate Report" button to download the file...');
        await frame.click(exportButtonSelector);

        // --- DYNAMICALLY WAIT FOR THE DOWNLOAD ---
        const downloadedFile = await waitForDownload(DOWNLOAD_PATH);
        
        // --- RENAME THE FILE ---
        const oldPath = path.join(DOWNLOAD_PATH, downloadedFile);
        const newPath = path.join(DOWNLOAD_PATH, 'Attendance_Logs.xlsx');
        if (fs.existsSync(newPath)) {
            fs.unlinkSync(newPath);
        }
        fs.renameSync(oldPath, newPath);
        console.log(`Successfully downloaded and renamed to 'Attendance_Logs.xlsx'`);

    } catch (error) {
        console.error('An error occurred during the automation process:', error);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

downloadAttendanceReport();

