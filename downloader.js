// downloader.js - A script to automate downloading Excel files from a website.
// This uses Puppeteer to control a Chrome browser.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// --- CONFIGURATION ---
const ESSL_LOGIN_URL = 'http://localhost/iclock/Main.aspx';
const USERNAME = 'essl';
const PASSWORD = 'essl';
// UPDATED: The script will now save files in the same folder it is located in.
const DOWNLOAD_PATH = __dirname; 
const CHROME_PROFILE_PATH = path.join(__dirname, 'ChromeProfile'); // Path to our persistent profile

async function downloadAttendanceReport() {
    console.log('Launching browser with a persistent profile...');

    // Check if the download directory exists, create it if not.
    if (!fs.existsSync(DOWNLOAD_PATH)) {
        console.log(`Download directory not found. Creating it at: ${DOWNLOAD_PATH}`);
        fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
    }

    // Using a persistent userDataDir to save settings and prevent pop-ups.
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        userDataDir: CHROME_PROFILE_PATH, // This uses your pre-configured profile
        args: [
            // Fallback argument to help prevent password manager pop-ups
            '--disable-features=PasswordManager'
        ]
    });
    
    const page = await browser.newPage();
    
    // Tell Puppeteer where to save downloaded files.
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: DOWNLOAD_PATH,
    });

    try {
        console.log(`Navigating to ${ESSL_LOGIN_URL}...`);
        await page.goto(ESSL_LOGIN_URL, { waitUntil: 'networkidle2' });

        // Since we are using a persistent profile, the site might already be logged in.
        const isLoggedIn = await page.$('#EasymenuMain');

        if (isLoggedIn) {
            console.log('Already logged in. Proceeding to navigation...');
        } else {
            console.log('Not logged in. Attempting to find and fill login form...');
            
            let loginFrame = page;
            const iframeElementHandle = await page.$('iframe'); 
            if (iframeElementHandle) {
                const frame = await iframeElementHandle.contentFrame();
                if (frame && await frame.$('#StaffloginDialog_txt_LoginName')) {
                    loginFrame = frame;
                }
            }
            
            console.log('Logging in...');
            await loginFrame.type('#StaffloginDialog_txt_LoginName', USERNAME);
            await loginFrame.type('#StaffloginDialog_Txt_Password', PASSWORD);
            await loginFrame.click('#StaffloginDialog_Btn_Ok');

            await page.waitForSelector('#EasymenuMain', { visible: true });
        }
        
        console.log('Login successful!');
        await new Promise(resolve => setTimeout(resolve, 2000));

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
        await new Promise(resolve => setTimeout(resolve, 5000));
        const iframeElement = await page.$('iframe#tabIframe');
        const frame = await iframeElement.contentFrame();

        if (!frame) {
            throw new Error('Could not access the iframe content.');
        }

        console.log('Successfully accessed the iframe.');
        
        // --- CLICK THE EXPORT BUTTON ---
        // UPDATED: Using the precise ID you provided.
        const exportButtonSelector = '#ReportProtoType_btn_GenerateReport';
        
        console.log(`Waiting for the export button: "${exportButtonSelector}"`);
        await frame.waitForSelector(exportButtonSelector, { visible: true });
        
        console.log('Clicking the "Generate Report" button to download the file...');
        await frame.click(exportButtonSelector);

        console.log('Waiting for download to complete... (waiting 15 seconds)');
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        // --- RENAME THE FILE ---
        const files = fs.readdirSync(DOWNLOAD_PATH);
        // Find the most recently downloaded Excel file
        const downloadedFile = files
            .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))
            .map(f => ({ file: f, mtime: fs.statSync(path.join(DOWNLOAD_PATH, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime)[0];
        
        if (downloadedFile && downloadedFile.file) {
            const oldPath = path.join(DOWNLOAD_PATH, downloadedFile.file);
            const newPath = path.join(DOWNLOAD_PATH, 'attendance.xlsx');
            if (fs.existsSync(newPath)) {
                fs.unlinkSync(newPath);
            }
            fs.renameSync(oldPath, newPath);
            console.log(`Successfully downloaded and renamed to 'attendance.xlsx'`);
        } else {
            console.error('Could not find the downloaded file. The download might have failed or the report took too long to generate.');
        }

    } catch (error) {
        console.error('An error occurred during the automation process:', error);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

downloadAttendanceReport();

